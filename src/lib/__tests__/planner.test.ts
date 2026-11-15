import { describe, expect, it } from '@jest/globals';

import { planGaps, roundGrams, solvePlan, subtractMacros, type Macros, type PlanFood } from '../planner';

// Representative per-100 g values (USDA-style), weighed raw/dry.
const food = (
  id: string,
  kcal: number,
  protein_g: number,
  carbs_g: number,
  fat_g: number,
  minG: number,
  typicalG: number,
  maxG: number,
  extra: Partial<PlanFood> = {},
): PlanFood => ({ id, per100g: { kcal, protein_g, carbs_g, fat_g }, minG, typicalG, maxG, ...extra });

const DAY: PlanFood[] = [
  food('oats', 379, 13.2, 67.7, 6.5, 40, 80, 150),
  food('whey', 400, 80, 8, 6, 20, 30, 60),
  food('banana', 89, 1.1, 22.8, 0.3, 120, 120, 360, { unitG: 120 }),
  food('chicken', 120, 22.5, 0, 2.6, 100, 180, 350),
  food('rice', 365, 7.1, 80, 0.7, 50, 100, 200),
  food('broccoli', 34, 2.8, 6.6, 0.4, 50, 100, 250),
  food('olive-oil', 884, 0, 0, 100, 3, 10, 20),
  food('salmon', 208, 20, 0, 13, 100, 150, 250),
  food('potato', 77, 2, 17, 0.1, 100, 250, 500),
  food('yoghurt', 59, 10, 3.6, 0.4, 100, 170, 300),
  food('eggs', 143, 12.6, 0.7, 9.5, 50, 100, 200, { unitG: 50 }),
];

// A real target from the calorie engine (80 kg male, light lifestyle, 60 min moderate run), so the
// macros add up to the calories the way the app's targets always do.
const TRAINING_DAY: Macros = { kcal: 3018, protein_g: 144, carbs_g: 466, fat_g: 64 };

// Same person on a rest day.
const REST_DAY: Macros = { kcal: 2314, protein_g: 144, carbs_g: 290, fat_g: 64 };

const relErr = (got: number, want: number) => Math.abs(got - want) / want;

describe('solvePlan', () => {
  it('hits a full day of targets closely using realistic portions', () => {
    const { grams, totals } = solvePlan(DAY, TRAINING_DAY, TRAINING_DAY);
    expect(relErr(totals.kcal, TRAINING_DAY.kcal)).toBeLessThan(0.02);
    expect(relErr(totals.protein_g, TRAINING_DAY.protein_g)).toBeLessThan(0.05);
    expect(relErr(totals.carbs_g, TRAINING_DAY.carbs_g)).toBeLessThan(0.05);
    expect(relErr(totals.fat_g, TRAINING_DAY.fat_g)).toBeLessThan(0.08);
    for (const f of DAY) {
      expect(grams[f.id]).toBeGreaterThanOrEqual(f.minG);
      expect(grams[f.id]).toBeLessThanOrEqual(f.maxG);
    }
    // Countable foods come out in whole units.
    expect(grams.eggs % 50).toBe(0);
    expect(grams.banana % 120).toBe(0);
    // Kitchen-scale rounding.
    expect(grams.chicken % 5).toBe(0);
  });

  it('respects fixed amounts and plans the rest around them', () => {
    const foods = DAY.map((f) => (f.id === 'oats' ? { ...f, fixedG: 60 } : f));
    const { grams, totals } = solvePlan(foods, REST_DAY, REST_DAY);
    expect(grams.oats).toBe(60);
    expect(relErr(totals.kcal, REST_DAY.kcal)).toBeLessThan(0.02);
  });

  it('re-balances what is left after food has been logged', () => {
    // Breakfast already eaten (logged elsewhere).
    const eaten: Macros = { kcal: 675, protein_g: 45, carbs_g: 90, fat_g: 15 };
    const remaining = subtractMacros(REST_DAY, eaten);
    const rest = DAY.filter((f) => !['oats', 'whey', 'banana'].includes(f.id));
    const { totals } = solvePlan(rest, remaining, REST_DAY);
    expect(Math.abs(totals.kcal + eaten.kcal - REST_DAY.kcal)).toBeLessThan(50);
    expect(Math.abs(totals.protein_g + eaten.protein_g - REST_DAY.protein_g)).toBeLessThan(8);
  });

  it('does its best and reports the gap when the foods cannot reach a target', () => {
    // Only lean protein + veg: carbs can't get anywhere near 360 g.
    const foods = [DAY[3], DAY[5]];
    const { grams, totals } = solvePlan(foods, TRAINING_DAY, TRAINING_DAY);
    expect(grams.chicken).toBe(350); // pushed to its max
    const gaps = planGaps(totals, TRAINING_DAY);
    expect(gaps.map((g) => g.key)).toEqual(expect.arrayContaining(['kcal', 'carbs_g']));
    expect(gaps.find((g) => g.key === 'carbs_g')!.diff).toBeLessThan(0);
  });

  it('handles an empty plan and zero-calorie foods', () => {
    expect(solvePlan([], TRAINING_DAY, TRAINING_DAY).totals.kcal).toBe(0);
    const coffee = food('coffee', 2, 0.1, 0, 0, 200, 250, 400);
    const { grams } = solvePlan([coffee], TRAINING_DAY, TRAINING_DAY);
    expect(grams.coffee).toBeGreaterThanOrEqual(200);
  });
});

describe('helpers', () => {
  it('rounds small portions to 1 g and larger ones to 5 g, within range', () => {
    expect(roundGrams(12.4, { minG: 3, maxG: 20 })).toBe(12);
    expect(roundGrams(183, { minG: 100, maxG: 350 })).toBe(185);
    expect(roundGrams(352, { minG: 100, maxG: 350 })).toBe(350);
  });

  it('ignores small misses', () => {
    expect(planGaps({ kcal: 3000, protein_g: 140, carbs_g: 460, fat_g: 66 }, TRAINING_DAY)).toEqual([]);
  });
});
