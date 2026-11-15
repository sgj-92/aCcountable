// Cleans up Claude's parsed plan so every item satisfies the database
// constraints (ranges ordered, values in bounds) before it reaches the app.

export const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type Meal = (typeof MEALS)[number];

export interface RawPlanItem {
  meal: string;
  name: string;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  min_g: number;
  typical_g: number;
  max_g: number;
  unit_name: string;
  unit_g: number;
}

export interface PlanItem {
  meal: Meal;
  name: string;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  min_g: number;
  typical_g: number;
  max_g: number;
  unit_name: string | null;
  unit_g: number | null;
}

const finite = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r1 = (v: number) => Math.round(v * 10) / 10;

export function normalizePlanItem(raw: RawPlanItem): PlanItem | null {
  const name = String(raw.name ?? '').trim().slice(0, 200);
  if (!name) return null;
  const meal = (MEALS as readonly string[]).includes(raw.meal) ? (raw.meal as Meal) : 'snack';

  const protein = clamp(finite(raw.protein_100g), 0, 100);
  const carbs = clamp(finite(raw.carbs_100g), 0, 100);
  const fat = clamp(finite(raw.fat_100g), 0, 100);
  let kcal = clamp(finite(raw.kcal_100g, NaN), 0, 950);
  if (!Number.isFinite(kcal)) kcal = protein * 4 + carbs * 4 + fat * 9;

  // Order the range and keep it within the column limits.
  let lo = clamp(finite(raw.min_g), 0, 5000);
  let hi = clamp(finite(raw.max_g, lo), 0, 5000);
  if (hi < lo) [lo, hi] = [hi, lo];
  if (hi === 0) hi = 100; // a range of nothing isn't useful; fall back to up to 100 g
  const typical = clamp(finite(raw.typical_g, (lo + hi) / 2), lo, hi);

  const unitG = finite(raw.unit_g);
  const unitName = String(raw.unit_name ?? '').trim().slice(0, 40);
  const countable = unitG > 0 && unitName.length > 0;

  return {
    meal,
    name,
    kcal_100g: r1(kcal),
    protein_100g: r1(protein),
    carbs_100g: r1(carbs),
    fat_100g: r1(fat),
    min_g: r1(lo),
    typical_g: r1(typical),
    max_g: r1(hi),
    unit_name: countable ? unitName : null,
    unit_g: countable ? r1(unitG) : null,
  };
}
