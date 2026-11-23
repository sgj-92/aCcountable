import { describe, expect, it, jest } from '@jest/globals';

import { dayTypeMacros, dayTypeTarget, mealTotals, templatePlanRows, templateSessions, type DayType } from '../day-types';
import type { DayTarget } from '../nutrition';

jest.mock('../supabase', () => ({ supabase: {} }));

const padel: DayType = {
  id: 'd1',
  name: 'Padel day',
  position: 0,
  kcal: 2400,
  protein_g: 180,
  carbs_g: 270,
  fat_g: 67,
  sessions: [{ activity: 'padel', whoop_activity: 'Padel', duration_min: 90, intensity: 'moderate' }],
  meals: [
    { meal: 'breakfast', name: 'Eggs', grams: 150, kcal_100g: 143, protein_100g: 12.6, carbs_100g: 0.7, fat_100g: 9.5, unit_name: 'egg', unit_g: 50, pantry_id: 'p1', source: 'ai', source_ref: null },
    { meal: 'lunch', name: 'Rice (dry)', grams: 80, kcal_100g: 350, protein_100g: 8, carbs_100g: 77, fat_100g: 1, unit_name: null, unit_g: null, pantry_id: null, source: 'usda', source_ref: '1' },
  ],
  notes: null,
};
const raw: DayTarget = { bmr: 1912, base: 1912, training: 561, kcal: 2473, proteinG: 147, carbsG: 300, fatG: 53, flooredAtBmr: true };

describe('day types', () => {
  it('uses the agreed numbers when no training is logged', () => {
    const t = dayTypeTarget(padel, raw, false, 561);
    expect([t.kcal, t.proteinG, t.carbsG, t.fatG]).toEqual([2400, 180, 270, 67]);
    expect(t.dayType).toBe('Padel day');
    expect(t.flooredAtBmr).toBe(false);
  });

  it('stays as agreed when the logged training matches what the day assumed', () => {
    expect(dayTypeTarget(padel, raw, true, 561).kcal).toBe(2400);
  });

  it('adds only the difference when training comes out higher (e.g. WHOOP-confirmed, or an extra session)', () => {
    const t = dayTypeTarget(padel, { ...raw, training: 761 }, true, 561);
    expect(t.kcal).toBe(2600);
    expect(t.training).toBe(200);
    expect(t.carbsG).toBe(320); // the extra 200 kcal lands in carbs
    expect(t.proteinG).toBe(180);
  });

  it('puts calorie changes from the week balance into carbs too', () => {
    expect(dayTypeMacros(padel, 2240)).toEqual({ proteinG: 180, carbsG: 230, fatG: 67 });
  });

  it('turns meals into plan items around the agreed portion', () => {
    const [eggs, rice] = templatePlanRows(padel, '2026-11-24', 2);
    expect([eggs.min_g, eggs.typical_g, eggs.max_g, eggs.position]).toEqual([100, 150, 250, 2]);
    expect([rice.min_g, rice.typical_g, rice.max_g]).toEqual([40, 80, 120]);
  });

  it('plans the assumed training as sessions', () => {
    const [s] = templateSessions(padel, '2026-11-24');
    expect(s).toMatchObject({ date: '2026-11-24', activity: 'padel', whoop_activity: 'Padel', duration_min: 90, actual_kcal: null });
  });

  it('adds up the meals at their agreed portions', () => {
    expect(Math.round(mealTotals(padel).kcal)).toBe(Math.round(143 * 1.5 + 350 * 0.8));
  });
});
