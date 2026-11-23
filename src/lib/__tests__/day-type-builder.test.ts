import { describe, expect, it, jest } from '@jest/globals';

import type { Profile } from '../api';
import { buildDayTypes, usualSessions } from '../day-type-builder';
import type { PantryItem } from '../pantry';
import type { ActivityRate } from '../whoop';

jest.mock('../supabase', () => ({ supabase: {} }));

const profile = {
  id: 'u',
  display_name: null,
  sex: 'male',
  birth_date: '1992-10-20',
  height_cm: 175,
  weight_kg: 98.3,
  lifestyle: 'light',
  goal: 'lose',
  goal_rate_kg_per_week: 0.5,
  protein_g_per_kg: 1.5,
  fat_pct: 25,
  training_eat_back_pct: 75,
  meal_slots: null,
  eating_window_start: null,
  eating_window_end: null,
  maintenance_adjust_kcal: 0,
} as Profile;

const padel: ActivityRate = { activity: 'padel', kcalPerMin: 9, samples: 38, label: 'Padel', typicalMin: 90 };
const run: ActivityRate = { activity: 'run', kcalPerMin: 11, samples: 12, label: 'Running', typicalMin: 50 };
const yoga: ActivityRate = { activity: 'yoga', kcalPerMin: 3, samples: 2, label: 'Yoga', typicalMin: 60 };

const item = (id: string, name: string, meal: PantryItem['meals'][number], kcal: number, p: number, c: number, f: number, portion: number): PantryItem => ({
  id, name, kcal_100g: kcal, protein_100g: p, carbs_100g: c, fat_100g: f, portion_g: portion, unit_name: null, unit_g: null, meals: [meal], source: 'ai', source_ref: null,
});
const pantry = [
  item('a', 'Oats', 'breakfast', 380, 13, 60, 7, 60),
  item('b', 'Whey', 'breakfast', 400, 80, 8, 6, 30),
  item('c', 'Chicken breast', 'lunch', 120, 23, 0, 2.5, 180),
  item('d', 'Basmati rice (dry)', 'lunch', 350, 8, 77, 1, 80),
  item('e', 'Salmon', 'dinner', 206, 22, 0, 13, 160),
  item('f', 'Potatoes', 'dinner', 77, 2, 17, 0.1, 250),
];

describe('buildDayTypes', () => {
  it('picks the usual sessions (3+ sessions) most-logged first', () => {
    expect(usualSessions([yoga, run, padel]).map((s) => s.whoop_activity)).toEqual(['Padel', 'Running']);
  });

  it('builds a rest day and a higher-carb day per usual session, protein and fat steady', () => {
    const [rest, padelDay, runDay] = buildDayTypes(profile, undefined, [padel, run], pantry, '2026-11-24');
    expect([rest.name, padelDay.name, runDay.name]).toEqual(['Rest day', 'Padel day', 'Running day']);
    expect(padelDay.kcal).toBeGreaterThan(rest.kcal);
    expect(padelDay.carbs_g).toBeGreaterThan(rest.carbs_g);
    expect(padelDay.protein_g).toBe(rest.protein_g);
    expect(padelDay.fat_g).toBe(rest.fat_g);
    expect(padelDay.sessions[0]).toMatchObject({ activity: 'padel', whoop_activity: 'Padel', duration_min: 90 });
  });

  it('sizes the pantry meals to land near each day’s target', () => {
    for (const d of buildDayTypes(profile, undefined, [padel], pantry, '2026-11-24')) {
      const kcal = d.meals.reduce((t, m) => t + (m.kcal_100g * m.grams) / 100, 0);
      expect(Math.abs(kcal - d.kcal)).toBeLessThan(d.kcal * 0.08);
      expect(d.meals.map((m) => m.meal)).toContain('dinner');
    }
  });
});
