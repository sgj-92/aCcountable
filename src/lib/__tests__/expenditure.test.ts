import { describe, expect, it } from '@jest/globals';

import { addDays } from '../dates';
import { estimateExpenditure, suggestedAdjustment, type ExpenditureDay } from '../expenditure';
import { weightTrend } from '../weight';

const END = '2026-11-21';
const dates = Array.from({ length: 28 }, (_, i) => addDays(END, -27 + i));

/** Weigh-ins every other day on a straight line (no noise), so the trend is exact enough to check. */
const weighIns = (startKg: number, kgPerWeek: number) =>
  dates.filter((_, i) => i % 2 === 0).map((date, i) => ({ date, weight_kg: startKg + (kgPerWeek / 7) * i * 2 }));

const days = (eaten: number, model: number, tracked = (i: number) => true): ExpenditureDay[] =>
  dates.map((date, i) => ({ date, eaten, tracked: tracked(i), model }));

describe('estimateExpenditure', () => {
  it('says what is missing when there is too little data', () => {
    const r = estimateExpenditure(days(2000, 2400, (i) => i < 5), weightTrend(weighIns(90, -0.5).slice(0, 2)), END);
    expect(r.burn).toBeNull();
    if (r.burn === null) expect(r.reason).toMatch(/more fully tracked days and .* more weigh-ins/);
  });

  it('finds a higher burn when you lose faster than the intake predicts', () => {
    // Eating 2,000 a day and losing ~0.5 kg/week → burn ≈ 2,000 + 550 = 2,550, formula said 2,300.
    const trend = weightTrend(weighIns(90, -0.5), 1); // alpha 1: trend = readings
    const r = estimateExpenditure(days(2000, 2300), trend, END);
    expect(r.burn).not.toBeNull();
    if (r.burn === null) return;
    expect(r.burn).toBeGreaterThan(2450);
    expect(r.burn).toBeLessThan(2650);
    expect(r.difference).toBeGreaterThan(150);
    expect(r.confidence).toBe('high');
  });

  it('leaves diary-only days out of the intake average', () => {
    const trend = weightTrend(weighIns(90, 0), 1);
    // Diary days logged only 500 kcal; counting them would drag the burn down.
    const d = dates.map((date, i) => ({ date, eaten: i % 4 === 0 ? 500 : 2200, tracked: i % 4 !== 0, model: 2200 }));
    const r = estimateExpenditure(d, trend, END);
    if (r.burn === null) throw new Error(r.reason);
    expect(r.burn).toBe(2200);
    expect(r.trackedDays).toBe(21);
  });
});

describe('suggestedAdjustment', () => {
  const base = { burn: 2550, model: 2300, difference: 250, trackedDays: 24, windowDays: 28, weighIns: 14, trendChangeKg: -1.8 };
  it('suggests the difference, rounded, on top of any earlier correction', () => {
    expect(suggestedAdjustment({ ...base, confidence: 'high' }, 0)).toBe(250);
    expect(suggestedAdjustment({ ...base, confidence: 'medium' }, 100)).toBe(350);
  });
  it('caps one step at 300 kcal and ignores small or shaky differences', () => {
    expect(suggestedAdjustment({ ...base, difference: 700, confidence: 'high' }, 0)).toBe(300);
    expect(suggestedAdjustment({ ...base, difference: 60, confidence: 'high' }, 0)).toBeNull();
    expect(suggestedAdjustment({ ...base, confidence: 'low' }, 0)).toBeNull();
  });
});
