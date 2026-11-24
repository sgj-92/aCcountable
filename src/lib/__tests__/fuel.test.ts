import { describe, expect, it } from '@jest/globals';

import { autoCorrection, carbCeilingGPerKg, shapeFuel, type FuelDayInput } from '../fuel';

const W = 98;
const day = (date: string, training: number, trainingMin: number, fixed = false): FuelDayInput => ({
  date,
  base: 2000,
  training,
  trainingMin,
  proteinG: 176, // 704 kcal
  fatG: 56, // 504 kcal
  fixed,
});
const week = (overrides: Record<number, Partial<FuelDayInput>> = {}) =>
  Array.from({ length: 7 }, (_, i) => ({ ...day(`2026-11-${23 + i}`, 0, 0), ...overrides[i] }));
const total = (days: { fuel: number }[]) => days.reduce((s, d) => s + d.fuel, 0);

describe('training fuel', () => {
  it('sets the carb ceiling by training time', () => {
    expect(carbCeilingGPerKg(0)).toBe(3);
    expect(carbCeilingGPerKg(60)).toBe(4.25);
    expect(carbCeilingGPerKg(120)).toBe(5.5);
    expect(carbCeilingGPerKg(600)).toBe(7);
  });

  it('moves a quarter of a big session to the next day; small ones stay', () => {
    const out = shapeFuel(week({ 1: { training: 800, trainingMin: 90 }, 3: { training: 300, trainingMin: 45 } }), W);
    expect(out[1].fuel).toBe(600);
    expect(out[2].recovery).toBe(200);
    expect(out[2].fuel).toBe(200);
    expect(out[3].fuel).toBe(300);
    expect(out[4].recovery).toBe(0);
  });

  it('holds back fuel over the carb ceiling and shares it with the following days, keeping the week total', () => {
    // 90 min of training: ceiling 4.875 g/kg, so 704 + 504 + 98 × 4.875 × 4 ≈ 3119 kcal.
    const input = week({ 0: { training: 2000, trainingMin: 90 } });
    const out = shapeFuel(input, W);
    const ceiling = 704 + 504 + W * 4.875 * 4;
    // Recovery first (500 to Tuesday), then Monday is capped at its ceiling.
    expect(Math.round(2000 + out[0].fuel)).toBe(Math.round(ceiling));
    expect(out[0].overCeiling).toBeLessThan(0);
    expect(out.slice(1).every((d) => d.shared > 0)).toBe(true);
    // Same week total (each day is rounded to a whole kcal).
    expect(Math.abs(total(out) - total(input.map((d) => ({ fuel: d.training }))))).toBeLessThanOrEqual(7);
  });

  it('never moves fuel backwards: earlier days are unchanged by later training', () => {
    const out = shapeFuel(week({ 4: { training: 3000, trainingMin: 120 } }), W);
    expect(out.slice(0, 4).every((d) => d.fuel === 0)).toBe(true);
  });

  it('keeps a Sunday session whole (nowhere later in the week) and leaves day-type days alone', () => {
    const out = shapeFuel(week({ 6: { training: 3000, trainingMin: 120 }, 2: { training: 900, trainingMin: 60, fixed: true } }), W);
    expect(out[6].fuel).toBe(3000);
    expect(out[2].fuel).toBe(900);
    expect(out[3].recovery).toBe(0);
  });
});

describe('weigh-in auto-correction', () => {
  it('steps at most 150 kcal a week towards the suggestion', () => {
    expect(autoCorrection(-400, 0, null, '2026-11-24')).toBe(-150);
    expect(autoCorrection(80, 0, null, '2026-11-24')).toBe(80);
    expect(autoCorrection(-400, -150, '2026-11-20', '2026-11-24')).toBeNull();
    expect(autoCorrection(-400, -150, '2026-11-17', '2026-11-24')).toBe(-300);
    expect(autoCorrection(null, 0, null, '2026-11-24')).toBeNull();
  });
});
