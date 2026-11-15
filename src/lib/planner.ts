/**
 * Meal-plan solver: given the foods someone plans to eat and what's left of
 * their day's targets, work out how many grams of each to eat.
 *
 * It minimises the weighted squared error of kcal / protein / carbs / fat
 * against the targets (each relative to the full-day target, so a 5% miss
 * costs the same for every macro), plus a very light pull towards each food's
 * typical portion so the answer stays natural when several mixes would fit.
 * Every food stays within its realistic [min, max] range.
 *
 * It's a small bounded convex problem, solved exactly enough by coordinate
 * descent. Countable foods (eggs, slices) are then rounded to whole units and
 * the rest re-balanced around them; finally amounts are rounded to 1 g (small
 * portions) or 5 g.
 */
import type { Per100g } from './foods';

export interface Macros {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface PlanFood {
  id: string;
  per100g: Per100g;
  minG: number;
  maxG: number;
  typicalG: number;
  /** Weight of one countable unit (an egg, a slice); amounts are then whole units. */
  unitG?: number | null;
  /** Amount the person has fixed; not optimised. */
  fixedG?: number | null;
}

export interface PlanSolution {
  grams: Record<string, number>;
  totals: Macros;
}

const KEYS = ['kcal', 'protein_g', 'carbs_g', 'fat_g'] as const;
type Key = (typeof KEYS)[number];
const PER100_KEY: Record<Key, keyof Per100g> = {
  kcal: 'kcal',
  protein_g: 'protein_g',
  carbs_g: 'carbs_g',
  fat_g: 'fat_g',
};

/** Calories matter most, then protein; carbs and fat absorb the rest. */
const WEIGHTS: Record<Key, number> = { kcal: 4, protein_g: 2, carbs_g: 1, fat_g: 1 };
/** Strength of the pull towards typical portions (tiny: a tie-breaker, not a goal). */
const PORTION_PULL = 1e-4;

export const ZERO: Macros = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };

export function macrosFor(per100g: Per100g, grams: number): Macros {
  const f = grams / 100;
  return {
    kcal: per100g.kcal * f,
    protein_g: per100g.protein_g * f,
    carbs_g: per100g.carbs_g * f,
    fat_g: per100g.fat_g * f,
  };
}

export function addMacros(a: Macros, b: Macros): Macros {
  return {
    kcal: a.kcal + b.kcal,
    protein_g: a.protein_g + b.protein_g,
    carbs_g: a.carbs_g + b.carbs_g,
    fat_g: a.fat_g + b.fat_g,
  };
}

export function subtractMacros(a: Macros, b: Macros): Macros {
  return {
    kcal: a.kcal - b.kcal,
    protein_g: a.protein_g - b.protein_g,
    carbs_g: a.carbs_g - b.carbs_g,
    fat_g: a.fat_g - b.fat_g,
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Continuous bounded least squares by coordinate descent. Mutates and returns `g`. */
function descend(
  foods: PlanFood[],
  g: number[],
  free: boolean[],
  target: Macros,
  scale: Macros,
): number[] {
  const n = foods.length;
  // a[i][k] = nutrient k per gram of food i
  const a = foods.map((f) => KEYS.map((k) => f.per100g[PER100_KEY[k]] / 100));
  const W = KEYS.map((k) => WEIGHTS[k] / Math.max(1, scale[k]) ** 2);
  const T = KEYS.map((k) => Math.max(0, target[k]));
  const L = foods.map((f) => PORTION_PULL / Math.max(1, f.typicalG) ** 2);
  // Running totals: sum[k] = Σ_i a[i][k] g[i]
  const sum = KEYS.map((_, k) => g.reduce((s, gi, i) => s + a[i][k] * gi, 0));

  for (let sweep = 0; sweep < 5000; sweep++) {
    let maxChange = 0;
    for (let i = 0; i < n; i++) {
      if (!free[i]) continue;
      let num = L[i] * foods[i].typicalG;
      let den = L[i];
      for (let k = 0; k < KEYS.length; k++) {
        const rest = sum[k] - a[i][k] * g[i]; // totals without food i
        num += W[k] * a[i][k] * (T[k] - rest);
        den += W[k] * a[i][k] * a[i][k];
      }
      const next = clamp(num / den, foods[i].minG, foods[i].maxG);
      const delta = next - g[i];
      if (delta !== 0) {
        for (let k = 0; k < KEYS.length; k++) sum[k] += a[i][k] * delta;
        g[i] = next;
        maxChange = Math.max(maxChange, Math.abs(delta));
      }
    }
    if (maxChange < 1e-4) break;
  }
  return g;
}

/** Nearest whole number of units within the food's range. */
function roundToUnits(grams: number, f: PlanFood): number {
  const unit = f.unitG!;
  const lo = Math.ceil(f.minG / unit - 1e-9);
  const hi = Math.max(lo, Math.floor(f.maxG / unit + 1e-9));
  return clamp(Math.round(grams / unit), lo, hi) * unit;
}

/** Scale-friendly rounding: 1 g for small portions (oil, honey), 5 g otherwise. */
export function roundGrams(grams: number, f: Pick<PlanFood, 'minG' | 'maxG'>): number {
  const step = grams < 30 ? 1 : 5;
  const r = Math.round(grams / step) * step;
  return clamp(r, f.minG, f.maxG);
}

/**
 * @param foods  foods still to be eaten
 * @param target what's left of the day's targets (full targets minus what's already logged)
 * @param scale  the full-day targets, used to weigh errors relatively
 */
export function solvePlan(foods: PlanFood[], target: Macros, scale: Macros): PlanSolution {
  const isFixed = (f: PlanFood) => f.fixedG != null && f.fixedG >= 0;
  const g = foods.map((f) => (isFixed(f) ? f.fixedG! : clamp(f.typicalG, f.minG, f.maxG)));
  const free = foods.map((f) => !isFixed(f));

  // Stage 1: everything that isn't fixed, continuously.
  descend(foods, g, free, target, scale);

  // Stage 2: countable foods to whole units, then re-balance the rest around them.
  let anyUnits = false;
  foods.forEach((f, i) => {
    if (free[i] && f.unitG && f.unitG > 0) {
      g[i] = roundToUnits(g[i], f);
      free[i] = false;
      anyUnits = true;
    }
  });
  if (anyUnits) descend(foods, g, free, target, scale);

  // Stage 3: round the remaining amounts for a kitchen scale.
  foods.forEach((f, i) => {
    if (free[i]) g[i] = roundGrams(g[i], f);
  });

  const grams: Record<string, number> = {};
  let totals = ZERO;
  foods.forEach((f, i) => {
    grams[f.id] = g[i];
    totals = addMacros(totals, macrosFor(f.per100g, g[i]));
  });
  return { grams, totals };
}

export interface Gap {
  key: Key;
  label: string;
  /** planned minus target (positive = over) */
  diff: number;
  unit: 'kcal' | 'g';
}

const LABELS: Record<Key, string> = { kcal: 'Calories', protein_g: 'Protein', carbs_g: 'Carbs', fat_g: 'Fat' };

/** Macros the plan misses by a meaningful amount (over 5% and over 50 kcal / 5 g). */
export function planGaps(projected: Macros, target: Macros): Gap[] {
  return KEYS.flatMap((k) => {
    const diff = projected[k] - target[k];
    const floor = k === 'kcal' ? 50 : 5;
    if (Math.abs(diff) <= Math.max(floor, Math.abs(target[k]) * 0.05)) return [];
    return [{ key: k, label: LABELS[k], diff, unit: k === 'kcal' ? 'kcal' : 'g' } as Gap];
  });
}
