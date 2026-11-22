import { describe, expect, it, jest } from '@jest/globals';

import { pantryToFood, pantryToPlanRow, portionLabel, type PantryItem } from '../pantry';

jest.mock('../supabase', () => ({ supabase: {} }));

const eggs: PantryItem = {
  id: 'p1',
  name: 'Eggs',
  kcal_100g: 143,
  protein_100g: 12.6,
  carbs_100g: 0.7,
  fat_100g: 9.5,
  portion_g: 100,
  unit_name: 'egg',
  unit_g: 50,
  meals: ['breakfast'],
  source: 'ai',
  source_ref: null,
};
const rice: PantryItem = { ...eggs, id: 'p2', name: 'Basmati rice (dry)', kcal_100g: 350, portion_g: 75, unit_name: null, unit_g: null, meals: [] };

describe('pantry', () => {
  it('labels portions in pieces when the food is countable', () => {
    expect(portionLabel(eggs, 100)).toBe('2 eggs · 100 g');
    expect(portionLabel(rice, 75)).toBe('75 g');
  });

  it('plans countable foods in whole units around the usual portion', () => {
    const row = pantryToPlanRow(eggs, '2026-11-23', 'breakfast', 0);
    expect([row.min_g, row.typical_g, row.max_g]).toEqual([50, 100, 150]);
  });

  it('plans other foods between half and one and a half portions', () => {
    const row = pantryToPlanRow(rice, '2026-11-23', 'lunch', 3);
    expect([row.min_g, row.typical_g, row.max_g]).toEqual([37.5, 75, 112.5]);
    expect(row.position).toBe(3);
  });

  it('offers the usual portion first when logging', () => {
    const f = pantryToFood(eggs);
    expect(f.servings[0]).toEqual({ label: 'Usual · 2 eggs · 100 g', grams: 100 });
    expect(f.pantryId).toBe('p1');
  });
});
