// Turns USDA FoodData Central and Open Food Facts responses into one shape.
// Pure functions (no I/O) so they can be tested against saved API responses.

export interface Per100g {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface FoodResult {
  /** `${source}:${ref}`, unique across sources. */
  id: string;
  source: 'usda' | 'off';
  /** USDA fdcId or Open Food Facts barcode. */
  ref: string;
  name: string;
  brand: string | null;
  /** Short provenance label, e.g. "USDA · lab analysed". */
  detail: string;
  per100g: Per100g;
  /** Common portions in grams, most useful first. */
  servings: { label: string; grams: number }[];
  /** True when one or more macros were missing and assumed to be 0. */
  incomplete: boolean;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
};
const atwater = (p: number, c: number, f: number) => p * 4 + c * 4 + f * 9;

/** "OREO CEREAL, OREO" → "Oreo Cereal, Oreo"; leaves mixed-case text alone. */
export function tidyName(s: string): string {
  const t = s.trim().replace(/\s+/g, ' ');
  if (t !== t.toUpperCase() || !/[A-Z]/.test(t)) return t;
  return t.toLowerCase().replace(/(^|[\s,(/-])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase());
}

function build(
  source: FoodResult['source'],
  ref: string,
  name: string,
  brand: string | null,
  detail: string,
  raw: { kcal?: number; protein?: number; carbs?: number; fat?: number },
  servings: FoodResult['servings'],
): FoodResult | null {
  const { kcal, protein, carbs, fat } = raw;
  if (kcal == null && protein == null && carbs == null && fat == null) return null;
  // USDA "carbohydrate by difference" can be slightly negative from rounding.
  const p = Math.max(0, protein ?? 0);
  const c = Math.max(0, carbs ?? 0);
  const f = Math.max(0, fat ?? 0);
  const energy = kcal ?? atwater(p, c, f);
  return {
    id: `${source}:${ref}`,
    source,
    ref,
    name,
    brand,
    detail,
    per100g: { kcal: Math.round(Math.max(0, energy)), protein_g: round1(p), carbs_g: round1(c), fat_g: round1(f) },
    servings,
    incomplete: protein == null || carbs == null || fat == null,
  };
}

// ───────────── USDA FoodData Central ─────────────

interface UsdaNutrient {
  nutrientId?: number;
  value?: number;
  unitName?: string;
}
export interface UsdaFood {
  fdcId: number;
  description: string;
  dataType?: string;
  brandName?: string;
  brandOwner?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  householdServingFullText?: string;
  foodNutrients?: UsdaNutrient[];
  foodMeasures?: { disseminationText?: string; gramWeight?: number }[];
}

const USDA_DETAIL: Record<string, string> = {
  Foundation: 'USDA · lab analysed',
  'SR Legacy': 'USDA · standard reference',
  'Survey (FNDDS)': 'USDA · as eaten',
  Branded: 'USDA · branded',
};

function usdaValue(food: UsdaFood, id: number, unit?: string): number | undefined {
  const n = food.foodNutrients?.find(
    (x) => x.nutrientId === id && (!unit || x.unitName?.toUpperCase() === unit),
  );
  return num(n?.value);
}

/** Search-result nutrient values are per 100 g for every data type, including Branded. */
export function normalizeUsdaFood(food: UsdaFood): FoodResult | null {
  if (!food?.fdcId || !food.description) return null;
  // Foundation foods omit 1008 and report Atwater energy (2048 specific, 2047 general).
  const kcal = usdaValue(food, 1008, 'KCAL') ?? usdaValue(food, 2048, 'KCAL') ?? usdaValue(food, 2047, 'KCAL');

  const servings: FoodResult['servings'] = [];
  for (const m of food.foodMeasures ?? []) {
    const grams = num(m.gramWeight);
    const label = m.disseminationText?.trim();
    if (!grams || grams <= 0 || !label || /quantity not specified/i.test(label)) continue;
    servings.push({ label, grams: round1(grams) });
  }
  const size = num(food.servingSize);
  if (size && size > 0 && /^(g|grm|gram|grams)$/i.test(food.servingSizeUnit ?? '')) {
    servings.unshift({ label: food.householdServingFullText?.trim() || '1 serving', grams: round1(size) });
  }

  return build(
    'usda',
    String(food.fdcId),
    tidyName(food.description),
    food.brandName ? tidyName(food.brandName) : food.brandOwner ? tidyName(food.brandOwner) : null,
    USDA_DETAIL[food.dataType ?? ''] ?? 'USDA',
    {
      kcal,
      protein: usdaValue(food, 1003),
      carbs: usdaValue(food, 1005),
      fat: usdaValue(food, 1004),
    },
    servings.slice(0, 6),
  );
}

// ───────────── Open Food Facts ─────────────

export interface OffProduct {
  code?: string;
  product_name?: string;
  product_name_en?: string;
  generic_name?: string;
  /** String from the product API, array from the search API. */
  brands?: string | string[];
  serving_size?: string;
  serving_quantity?: number | string;
  nutriments?: Record<string, unknown>;
}

function offBrand(brands: OffProduct['brands']): string | null {
  const list = (Array.isArray(brands) ? brands : (brands ?? '').split(','))
    .map((b) => b.trim())
    .filter(Boolean);
  return list.length ? list.slice(0, 2).join(', ') : null;
}

export function normalizeOffProduct(p: OffProduct): FoodResult | null {
  const name = (p.product_name || p.product_name_en || p.generic_name || '').trim();
  if (!p.code || !name) return null;
  const n = p.nutriments ?? {};
  const kj = num(n['energy-kj_100g']) ?? num(n['energy_100g']); // energy_100g is kJ
  const kcal = num(n['energy-kcal_100g']) ?? (kj != null ? kj / 4.184 : undefined);

  const servings: FoodResult['servings'] = [];
  const grams = num(p.serving_quantity);
  if (grams && grams > 0) servings.push({ label: p.serving_size?.trim() || '1 serving', grams: round1(grams) });

  return build(
    'off',
    p.code,
    name,
    offBrand(p.brands),
    'Open Food Facts',
    {
      kcal,
      protein: num(n['proteins_100g']),
      carbs: num(n['carbohydrates_100g']),
      fat: num(n['fat_100g']),
    },
    servings,
  );
}

/** Drop repeats (same name, brand and kcal), which are common in Open Food Facts. */
export function dedupe(results: FoodResult[]): FoodResult[] {
  const seen = new Set<string>();
  return results.filter((r) => {
    const key = `${r.name.toLowerCase()}|${(r.brand ?? '').toLowerCase()}|${r.per100g.kcal}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Scanners report UPC-A as 13-digit EAN with a leading 0 (and USDA stores
 * 12-digit UPCs), so try both forms.
 */
export function barcodeVariants(code: string): string[] {
  const digits = code.replace(/\D/g, '');
  const out = new Set<string>([digits]);
  if (digits.length === 13 && digits.startsWith('0')) out.add(digits.slice(1));
  if (digits.length === 12) out.add('0' + digits);
  return [...out];
}
