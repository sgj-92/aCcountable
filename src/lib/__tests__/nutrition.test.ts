import { describe, expect, it } from '@jest/globals';

import {
  bmr,
  dayTarget,
  DEFAULT_SETTINGS,
  goalAdjustment,
  kcalFromMacros,
  sessionBurn,
  sumTotals,
  type BodyStats,
} from '../nutrition';

const male: BodyStats = { sex: 'male', age: 30, heightCm: 180, weightKg: 80 };
const female: BodyStats = { sex: 'female', age: 25, heightCm: 165, weightKg: 60 };

describe('bmr (Mifflin-St Jeor)', () => {
  it('matches the published formula', () => {
    expect(bmr(male)).toBeCloseTo(1780);
    expect(bmr(female)).toBeCloseTo(1345.25);
  });
});

describe('goalAdjustment', () => {
  it('is zero for maintain and ±7700 kcal/kg spread over a week otherwise', () => {
    expect(goalAdjustment('maintain', 0.5)).toBe(0);
    expect(goalAdjustment('lose', 0.5)).toBeCloseTo(-550);
    expect(goalAdjustment('gain', 0.25)).toBeCloseTo(275);
  });
});

describe('sessionBurn', () => {
  it('uses net METs (MET − 1) × kg × hours', () => {
    expect(sessionBurn({ activity: 'run', durationMin: 60, intensity: 'moderate' }, 80)).toBeCloseTo(704);
    expect(sessionBurn({ activity: 'strength', durationMin: 30, intensity: 'hard' }, 80)).toBeCloseTo(200);
  });

  it('prefers a manual override, including zero', () => {
    expect(sessionBurn({ activity: 'run', durationMin: 60, intensity: 'hard', kcalOverride: 500 }, 80)).toBe(500);
    expect(sessionBurn({ activity: 'run', durationMin: 60, intensity: 'hard', kcalOverride: 0 }, 80)).toBe(0);
  });

  it('never goes negative', () => {
    expect(sessionBurn({ activity: 'yoga', durationMin: -10, intensity: 'easy' }, 80)).toBe(0);
  });
});

describe('dayTarget', () => {
  it('rest day = BMR × lifestyle, carbs fill the remainder', () => {
    const t = dayTarget(male, DEFAULT_SETTINGS, []);
    expect(t.bmr).toBe(1780);
    expect(t.base).toBe(2314); // 1780 × 1.3
    expect(t.training).toBe(0);
    expect(t.kcal).toBe(2314);
    expect(t.proteinG).toBe(144); // 1.8 g/kg
    expect(t.fatG).toBe(64); // 25% of base / 9
    expect(t.carbsG).toBe(290);
    expect(t.flooredAtBmr).toBe(false);
  });

  it('adds each session on top, and the extra lands in carbs', () => {
    const rest = dayTarget(male, DEFAULT_SETTINGS, []);
    const t = dayTarget(male, DEFAULT_SETTINGS, [
      { activity: 'run', durationMin: 60, intensity: 'moderate' },
      { activity: 'strength', durationMin: 30, intensity: 'hard' },
    ]);
    expect(t.training).toBe(904);
    expect(t.kcal).toBe(3218);
    expect(t.proteinG).toBe(rest.proteinG);
    expect(t.fatG).toBe(rest.fatG);
    expect(t.carbsG).toBe(rest.carbsG + 226); // 904 / 4
  });

  it('applies the eat-back percentage', () => {
    const t = dayTarget(male, { ...DEFAULT_SETTINGS, trainingEatBackPct: 50 }, [
      { activity: 'run', durationMin: 60, intensity: 'moderate' },
    ]);
    expect(t.training).toBe(352);
  });

  it('applies a deficit but never below BMR', () => {
    const lose = dayTarget(male, { ...DEFAULT_SETTINGS, goal: 'lose', goalRateKgPerWeek: 0.5 }, []);
    expect(lose.base).toBe(1780); // 2314 − 550 = 1764 is under BMR (1780), so floored
    expect(lose.flooredAtBmr).toBe(true);

    const mild = dayTarget(
      male,
      { ...DEFAULT_SETTINGS, lifestyle: 'active', goal: 'lose', goalRateKgPerWeek: 0.5 },
      [],
    );
    expect(mild.base).toBe(2120); // 1780 × 1.5 − 550
    expect(mild.flooredAtBmr).toBe(false);
  });
});

describe('helpers', () => {
  it('sums totals and derives kcal from macros', () => {
    const t = sumTotals([
      { kcal: 100, protein_g: 10, carbs_g: 5, fat_g: 2 },
      { kcal: 250, protein_g: 20, carbs_g: 30, fat_g: 5 },
    ]);
    expect(t).toEqual({ kcal: 350, proteinG: 30, carbsG: 35, fatG: 7 });
    expect(kcalFromMacros(30, 35, 7)).toBe(323);
  });
});
