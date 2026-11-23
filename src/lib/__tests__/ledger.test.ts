import { describe, expect, it, jest } from '@jest/globals';

import type { FoodEntry, TrainingSession } from '../api';
import { buildLedgerSnapshot, fromLedgerType, mealRef, toLedgerType } from '../ledger';
import type { PlanItem } from '../plans';

jest.mock('../supabase', () => ({ supabase: {} }));

const date = '2026-11-24';
const session: TrainingSession = {
  id: 's1', date, activity: 'padel', duration_min: 90, intensity: 'moderate', kcal_override: null, actual_kcal: null,
  actual_duration_min: null, whoop_activity: 'Padel', notes: null, start_time: '18:00', external_ref: null,
};
const eggs: FoodEntry = {
  id: 'f1', date, meal: 'breakfast', name: 'Eggs', serving: '2 eggs · 100 g', kcal: 143, protein_g: 12.6, carbs_g: 0.7, fat_g: 9.5,
  grams: 100, source: 'manual', source_ref: null, ai_confidence: null, created_at: '',
};
const rice: PlanItem = {
  id: 'p1', date, meal: 'lunch', position: 0, name: 'Rice (dry)', kcal_100g: 350, protein_100g: 8, carbs_100g: 77, fat_100g: 1,
  min_g: 40, typical_g: 80, max_g: 120, unit_name: null, unit_g: null, fixed_g: null, source: 'usda', source_ref: null, logged_entry_id: null,
};

describe('ledger sync', () => {
  it('maps training types both ways', () => {
    expect(toLedgerType('strength')).toBe('resistance');
    expect(toLedgerType('run')).toBe('cardio');
    expect(toLedgerType('tennis')).toBe('padel');
    expect(fromLedgerType('resistance')).toBe('strength');
    expect(fromLedgerType('cardio')).toBe('other');
    expect(fromLedgerType('nonsense')).toBe('other');
  });

  it('builds a day: training with time, meals with eaten and planned foods, nutrition and diary', () => {
    const s = buildLedgerSnapshot({
      date,
      sessions: [session],
      slots: [
        { key: 'breakfast', label: 'Meal 1' },
        { key: 'lunch', label: 'Meal 2' },
        { key: 'dinner', label: 'Meal 3' },
      ],
      food: [eggs],
      plan: [rice],
      isLogged: () => false,
      gramsFor: () => 100,
      times: { breakfast: { minutes: 450 }, lunch: { minutes: 960, tag: 'pre' } },
      target: { kcal: 2400, proteinG: 180, carbsG: 270, fatG: 67 },
      dayType: 'Padel day',
      diaryOnly: false,
      weightKg: 98.3,
    });
    expect(s.training).toEqual([{ ref: 'acc:session:s1', type: 'padel', title: 'Padel', startTime: '18:00', durationMin: 90 }]);
    expect(s.meals.map((m) => [m.name, m.time, m.tag, m.kcal, m.done])).toEqual([
      ['Meal 1', '07:30', null, 143, true],
      ['Meal 2', '16:00', 'pre', 350, false],
    ]);
    expect(s.meals[1].ref).toBe(mealRef(date, 'lunch'));
    expect(s.meals[1].planned).toEqual([{ planItemId: 'p1', grams: 100 }]);
    expect(s.nutrition).toMatchObject({ eatenKcal: 143, targetKcal: 2400, dayType: 'Padel day' });
    expect(s.nutrition!.diary).toEqual(['Meal 1: Eggs · 2 eggs · 100 g (143 kcal)']);
    expect(s.weightKg).toBe(98.3);
  });

  it('keeps Ledger’s reference on sessions that came from Ledger', () => {
    const s = buildLedgerSnapshot({
      date, sessions: [{ ...session, external_ref: 'ledger:2026-11-24:padel' }], slots: [], food: [], plan: [],
      isLogged: () => false, gramsFor: () => 0, times: null, target: null, dayType: null, diaryOnly: false, weightKg: null,
    });
    expect(s.training[0].ref).toBe('ledger:2026-11-24:padel');
    expect(s.nutrition).toBeNull();
  });
});
