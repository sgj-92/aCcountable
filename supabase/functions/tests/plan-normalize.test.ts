import { assertEquals } from 'jsr:@std/assert@1';

import { normalizePlanItem, type RawPlanItem } from '../plan-day/normalize.ts';

const base: RawPlanItem = {
  meal: 'lunch',
  name: 'Chicken breast, skinless (raw)',
  kcal_100g: 120,
  protein_100g: 22.5,
  carbs_100g: 0,
  fat_100g: 2.6,
  min_g: 100,
  typical_g: 180,
  max_g: 350,
  unit_name: '',
  unit_g: 0,
};

Deno.test('passes a well-formed item through', () => {
  const r = normalizePlanItem(base)!;
  assertEquals(r.meal, 'lunch');
  assertEquals([r.min_g, r.typical_g, r.max_g], [100, 180, 350]);
  assertEquals([r.unit_name, r.unit_g], [null, null]);
});

Deno.test('orders a reversed range and pulls typical inside it', () => {
  const r = normalizePlanItem({ ...base, min_g: 300, max_g: 100, typical_g: 50 })!;
  assertEquals([r.min_g, r.typical_g, r.max_g], [100, 100, 300]);
});

Deno.test('keeps countable units only when both name and weight are given', () => {
  assertEquals(normalizePlanItem({ ...base, name: 'Egg', unit_name: 'egg', unit_g: 50 })!.unit_g, 50);
  assertEquals(normalizePlanItem({ ...base, unit_name: 'egg', unit_g: 0 })!.unit_name, null);
});

Deno.test('clamps values to database limits and fixes unknown meals', () => {
  const r = normalizePlanItem({ ...base, meal: 'brunch', protein_100g: 140, kcal_100g: 2000, max_g: 9000 })!;
  assertEquals(r.meal, 'snack');
  assertEquals(r.protein_100g, 100);
  assertEquals(r.kcal_100g, 950);
  assertEquals(r.max_g, 5000);
});

Deno.test('drops nameless items', () => {
  assertEquals(normalizePlanItem({ ...base, name: '  ' }), null);
});

Deno.test("keeps the person's meal keys and files anything else under their last meal", () => {
  const twoMeals = ['breakfast', 'lunch'] as const;
  assertEquals(normalizePlanItem({ ...base, meal: 'lunch' }, twoMeals)!.meal, 'lunch');
  assertEquals(normalizePlanItem({ ...base, meal: 'dinner' }, twoMeals)!.meal, 'lunch');
  assertEquals(normalizePlanItem({ ...base, meal: 'meal6' }, ['breakfast', 'meal5', 'meal6'])!.meal, 'meal6');
});
