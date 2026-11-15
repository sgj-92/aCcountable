import { FunctionsHttpError } from '@supabase/supabase-js';

import { addFoodEntry, type FoodEntry, type Meal } from './api';
import type { Per100g } from './foods';
import type { MealSlot } from './meals';
import type { Macros, PlanFood } from './planner';
import { supabase } from './supabase';

export interface PlanItem {
  id: string;
  date: string;
  meal: Meal;
  position: number;
  name: string;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  min_g: number;
  typical_g: number;
  max_g: number;
  unit_name: string | null;
  unit_g: number | null;
  fixed_g: number | null;
  source: 'ai' | 'usda' | 'off' | 'manual';
  source_ref: string | null;
  logged_entry_id: string | null;
}

type ParsedItem = Pick<
  PlanItem,
  | 'meal'
  | 'name'
  | 'kcal_100g'
  | 'protein_100g'
  | 'carbs_100g'
  | 'fat_100g'
  | 'min_g'
  | 'typical_g'
  | 'max_g'
  | 'unit_name'
  | 'unit_g'
>;

const COLUMNS =
  'id,date,meal,position,name,kcal_100g,protein_100g,carbs_100g,fat_100g,min_g,typical_g,max_g,unit_name,unit_g,fixed_g,source,source_ref,logged_entry_id';

const NUMERIC: (keyof PlanItem)[] = [
  'kcal_100g',
  'protein_100g',
  'carbs_100g',
  'fat_100g',
  'min_g',
  'typical_g',
  'max_g',
  'unit_g',
  'fixed_g',
];

function normalise(row: PlanItem): PlanItem {
  const out = { ...row } as Record<string, unknown>;
  for (const k of NUMERIC) out[k] = row[k] == null ? null : Number(row[k]);
  return out as unknown as PlanItem;
}

export const per100gOf = (i: PlanItem): Per100g => ({
  kcal: i.kcal_100g,
  protein_g: i.protein_100g,
  carbs_g: i.carbs_100g,
  fat_g: i.fat_100g,
});

export const toPlanFood = (i: PlanItem): PlanFood => ({
  id: i.id,
  per100g: per100gOf(i),
  minG: i.min_g,
  maxG: i.max_g,
  typicalG: i.typical_g,
  unitG: i.unit_g,
  fixedG: i.fixed_g,
});

/** "185 g", or "3 eggs · 150 g" for countable foods. */
export function amountLabel(item: Pick<PlanItem, 'unit_name' | 'unit_g'>, grams: number): string {
  const g = Math.round(grams).toLocaleString();
  if (item.unit_g && item.unit_name) {
    const n = Math.round(grams / item.unit_g);
    return `${n} ${item.unit_name}${n === 1 ? '' : 's'} · ${g} g`;
  }
  return `${g} g`;
}

export async function listPlanItems(date: string): Promise<PlanItem[]> {
  const { data, error } = await supabase
    .from('plan_items')
    .select(COLUMNS)
    .eq('date', date)
    .order('position')
    .order('created_at');
  if (error) throw new Error(error.message);
  return (data as unknown as PlanItem[]).map(normalise);
}

export async function getPlanItem(id: string): Promise<PlanItem> {
  const { data, error } = await supabase.from('plan_items').select(COLUMNS).eq('id', id).single();
  if (error) throw new Error(error.message);
  return normalise(data as unknown as PlanItem);
}

export async function updatePlanItem(id: string, patch: Partial<Omit<PlanItem, 'id' | 'date'>>): Promise<void> {
  const { error } = await supabase.from('plan_items').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deletePlanItems(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from('plan_items').delete().in('id', ids);
  if (error) throw new Error(error.message);
}

/**
 * Sends the free-text list to Claude (via the plan-day function) and appends the
 * foods it returns to the plan for `date`.
 */
export async function addFoodsFromText(
  date: string,
  text: string,
  targets: Macros | null,
  startPosition: number,
  meals: MealSlot[],
): Promise<{ added: number; notes: string }> {
  const { data, error } = await supabase.functions.invoke<{ items: ParsedItem[]; notes: string }>('plan-day', {
    body: { text, targets: targets ?? undefined, meals },
  });
  if (error) {
    let message: string | undefined;
    if (error instanceof FunctionsHttpError) {
      try {
        const b = await error.context.json();
        if (typeof b?.error === 'string') message = b.error;
      } catch {
        // non-JSON body
      }
    }
    throw new Error(message ?? (error.message || 'Planning failed'));
  }
  const items = data?.items ?? [];
  if (items.length === 0) return { added: 0, notes: data?.notes ?? '' };
  const rows = items.map((i, n) => ({ ...i, date, position: startPosition + n, source: 'ai' as const }));
  const { error: insertError } = await supabase.from('plan_items').insert(rows);
  if (insertError) throw new Error(insertError.message);
  return { added: rows.length, notes: data?.notes ?? '' };
}

/** Logs a planned food as eaten (at the weighed amount) and links it to the plan. */
export async function logPlanItem(item: PlanItem, grams: number): Promise<void> {
  const f = grams / 100;
  const round1 = (v: number) => Math.round(v * 10) / 10;
  const source: FoodEntry['source'] = item.source === 'usda' || item.source === 'off' ? item.source : 'manual';
  const entryId = await addFoodEntry({
    date: item.date,
    meal: item.meal,
    name: item.name,
    serving: `${round1(grams)} g`,
    kcal: Math.round(item.kcal_100g * f),
    protein_g: round1(item.protein_100g * f),
    carbs_g: round1(item.carbs_100g * f),
    fat_g: round1(item.fat_100g * f),
    grams: round1(grams),
    source,
    source_ref: item.source_ref,
    ai_confidence: null,
  });
  await updatePlanItem(item.id, { logged_entry_id: entryId });
}
