import { assertEquals } from 'jsr:@std/assert@1';

import { normalizeDayType, type RawDayType } from '../parse-day-types/normalize.ts';

const keys = ['breakfast', 'lunch', 'dinner', 'snack', 'meal5'];

const raw: RawDayType = {
  name: '  Padel day  ',
  kcal: 2400.4,
  protein_g: 180,
  carbs_g: 270,
  fat_g: 67,
  sessions: [
    { activity: 'padel', whoop_activity: 'Padel', duration_min: 90, intensity: 'moderate' },
    { activity: 'kitesurf', whoop_activity: '', duration_min: 30, intensity: 'extreme' },
    { activity: 'run', whoop_activity: '', duration_min: 0, intensity: 'easy' },
  ],
  meals: [
    { meal: 'breakfast', food: 'Eggs', pantry_name: 'Eggs', grams: 150, kcal_100g: 143, protein_100g: 12.6, carbs_100g: 0.7, fat_100g: 9.5, unit_name: 'egg', unit_g: 50 },
    { meal: 'brunch', food: 'Oats', pantry_name: '', grams: 50, kcal_100g: 380, protein_100g: 13, carbs_100g: 60, fat_100g: 7, unit_name: '', unit_g: 0 },
    { meal: 'lunch', food: '', pantry_name: '', grams: 100, kcal_100g: 1, protein_100g: 0, carbs_100g: 0, fat_100g: 0, unit_name: '', unit_g: 0 },
  ],
};

Deno.test('day types: trims, clamps and drops unusable parts', () => {
  const d = normalizeDayType(raw, keys)!;
  assertEquals(d.name, 'Padel day');
  assertEquals(d.kcal, 2400);
  assertEquals(d.sessions.length, 2);
  assertEquals(d.sessions[1], { activity: 'other', whoop_activity: null, duration_min: 30, intensity: 'moderate' });
  assertEquals(d.meals.length, 2);
  assertEquals(d.meals[1].meal, 'breakfast'); // unknown meal falls back to the first
  assertEquals(d.meals[0].unit_name, 'egg');
});

Deno.test('day types: a nameless day type is dropped', () => {
  assertEquals(normalizeDayType({ ...raw, name: '  ' }, keys), null);
});
