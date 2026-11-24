import { describe, expect, it, jest } from '@jest/globals';

import type { FoodEntry } from '../api';
import type { PlanItem } from '../plans';
import { timeGroups } from '../time-groups';

jest.mock('../supabase', () => ({ supabase: {} }));

const date = '2026-11-24';
const food = (id: string, eaten_at: number | null, created = '2026-11-24T23:59:00'): FoodEntry => ({
  id, date, meal: 'breakfast', name: id, serving: null, kcal: 100, protein_g: 1, carbs_g: 1, fat_g: 1, grams: null,
  source: 'manual', source_ref: null, ai_confidence: null, created_at: created, eaten_at,
});
const plan = (id: string, meal: PlanItem['meal']): PlanItem => ({
  id, date, meal, position: 0, name: id, kcal_100g: 100, protein_100g: 1, carbs_100g: 1, fat_100g: 1, min_g: 0, typical_g: 100,
  max_g: 200, unit_name: null, unit_g: null, fixed_g: null, source: 'usda', source_ref: null, logged_entry_id: null,
});

describe('time groups', () => {
  it('groups food by the hour eaten, in time order, with the earliest time', () => {
    const g = timeGroups([food('a', 9 * 60 + 40), food('b', 9 * 60 + 5), food('c', 12 * 60 + 30)], [], null, false);
    expect(g.map((x) => [x.minutes, x.items.map((f) => f.id)])).toEqual([
      [9 * 60 + 5, ['a', 'b']],
      [12 * 60 + 30, ['c']],
    ]);
  });

  it('puts planned meals at their suggested time, joining food in that hour; untimed plans go last', () => {
    const g = timeGroups(
      [food('a', 16 * 60 + 10)],
      [plan('p1', 'lunch'), plan('p2', 'dinner')],
      { lunch: { minutes: 16 * 60, tag: 'pre' } },
      false,
    );
    expect(g[0].items.map((f) => f.id)).toEqual(['a']);
    expect(g[0].planned.map((p) => p.id)).toEqual(['p1']);
    expect(g[0].suggested?.tag).toBe('pre');
    expect(g[1].minutes).toBeNull();
    expect(g[1].planned.map((p) => p.id)).toEqual(['p2']);
  });

  it('adds an empty group for now on today, unless that hour already has one', () => {
    expect(timeGroups([food('a', 8 * 60)], [], null, true, 13 * 60 + 2).map((x) => x.minutes)).toEqual([480, 782]);
    expect(timeGroups([food('a', 13 * 60 + 30)], [], null, true, 13 * 60 + 2)).toHaveLength(1);
  });
});
