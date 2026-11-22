/**
 * The pantry: the foods someone eats as part of their diet, each with nutrition
 * per 100 g, the portion they usually have and the meals they usually have it at.
 */
import type { FoodEntry, Meal } from './api';
import { countLabel, type FoodResult } from './foods';
import type { PlanItem } from './plans';
import { supabase } from './supabase';

export interface PantryItem {
  id: string;
  name: string;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  portion_g: number;
  unit_name: string | null;
  unit_g: number | null;
  meals: Meal[];
  source: 'ai' | 'usda' | 'off' | 'manual';
  source_ref: string | null;
}

export type NewPantryItem = Omit<PantryItem, 'id'>;

const COLUMNS = 'id,name,kcal_100g,protein_100g,carbs_100g,fat_100g,portion_g,unit_name,unit_g,meals,source,source_ref';
const num = (v: unknown) => (v == null ? null : Number(v));
const round1 = (n: number) => Math.round(n * 10) / 10;

function normalise(r: PantryItem): PantryItem {
  return {
    ...r,
    kcal_100g: Number(r.kcal_100g),
    protein_100g: Number(r.protein_100g),
    carbs_100g: Number(r.carbs_100g),
    fat_100g: Number(r.fat_100g),
    portion_g: Number(r.portion_g),
    unit_g: num(r.unit_g),
    meals: (r.meals ?? []) as Meal[],
  };
}

/** Raised when the pantry table hasn't been created yet (migration not applied). */
export class PantryMissingError extends Error {}

export async function listPantry(): Promise<PantryItem[]> {
  const res = await supabase.from('pantry_items').select(COLUMNS).order('name');
  if (res.error) {
    if (/pantry_items/.test(res.error.message) && /exist|schema cache/i.test(res.error.message))
      throw new PantryMissingError('The pantry isn’t set up in your database yet.');
    throw new Error(res.error.message);
  }
  return (res.data as unknown as PantryItem[]).map(normalise);
}

export async function getPantryItem(id: string): Promise<PantryItem> {
  const res = await supabase.from('pantry_items').select(COLUMNS).eq('id', id).single();
  if (res.error) throw new Error(res.error.message);
  return normalise(res.data as unknown as PantryItem);
}

/** Adds foods; a food with the same name replaces the saved one. */
export async function savePantryItems(items: NewPantryItem[]): Promise<void> {
  if (items.length === 0) return;
  const res = await supabase.from('pantry_items').upsert(items, { onConflict: 'user_id,name' });
  if (res.error) throw new Error(res.error.message);
}

export async function updatePantryItem(id: string, patch: Partial<NewPantryItem>): Promise<void> {
  const res = await supabase.from('pantry_items').update(patch).eq('id', id);
  if (res.error) throw new Error(res.error.message);
}

export async function deletePantryItem(id: string): Promise<void> {
  const res = await supabase.from('pantry_items').delete().eq('id', id);
  if (res.error) throw new Error(res.error.message);
}

/** "2 eggs · 100 g" or "250 g". */
export function portionLabel(p: Pick<PantryItem, 'unit_name' | 'unit_g'>, grams: number): string {
  if (p.unit_name && p.unit_g) return `${countLabel(grams / p.unit_g, p.unit_name)} · ${Math.round(grams)} g`;
  return `${Math.round(grams)} g`;
}

export const portionKcal = (p: Pick<PantryItem, 'kcal_100g'>, grams: number) => Math.round((p.kcal_100g * grams) / 100);

/** A pantry food as a search result, so Add food can weigh or log it. */
export function pantryToFood(p: PantryItem): FoodResult {
  const unit = p.unit_name && p.unit_g ? { name: p.unit_name, grams: p.unit_g } : undefined;
  const servings: FoodResult['servings'] = [{ label: `Usual · ${portionLabel(p, p.portion_g)}`, grams: p.portion_g }];
  if (unit && Math.abs(unit.grams - p.portion_g) > 0.5) servings.push({ label: `1 ${unit.name}`, grams: unit.grams });
  return {
    id: `pantry:${p.id}`,
    // Logged with the pantry's own source so database foods keep their reference.
    source: p.source === 'usda' || p.source === 'off' ? p.source : 'ai',
    ref: p.source_ref ?? '',
    name: p.name,
    brand: null,
    detail: 'Pantry',
    per100g: { kcal: p.kcal_100g, protein_g: p.protein_100g, carbs_g: p.carbs_100g, fat_g: p.fat_100g },
    servings,
    incomplete: false,
    unit,
    pantryId: p.id,
  };
}

/** Adds pantry foods to a day's plan, each at its usual meal (or `fallbackMeal`). */
export async function addPantryToPlan(items: PantryItem[], date: string, startPosition: number, fallbackMeal: Meal) {
  const rows = items.map((p, n) => pantryToPlanRow(p, date, p.meals[0] ?? fallbackMeal, startPosition + n));
  const res = await supabase.from('plan_items').insert(rows);
  if (res.error) throw new Error(res.error.message);
}

/** Saves a food from search / AI / the weigh step to the pantry at the given portion. */
export function pantryFromFood(
  f: FoodResult,
  grams: number,
  meal: Meal | null,
  source?: FoodEntry['source'],
): NewPantryItem {
  return {
    name: (f.brand ? `${f.name} · ${f.brand}` : f.name).slice(0, 200),
    kcal_100g: round1(Math.min(950, f.per100g.kcal)),
    protein_100g: round1(Math.min(100, f.per100g.protein_g)),
    carbs_100g: round1(Math.min(100, f.per100g.carbs_g)),
    fat_100g: round1(Math.min(100, f.per100g.fat_g)),
    portion_g: round1(Math.max(1, grams)),
    unit_name: f.unit?.name ?? null,
    unit_g: f.unit?.grams ?? null,
    meals: meal ? [meal] : [],
    source: f.source === 'ai' ? (source === 'usda' || source === 'off' ? source : 'ai') : f.source,
    source_ref: f.source === 'ai' ? null : f.ref || null,
  };
}

/**
 * A pantry food as a plan item: the solver may pick between half and one and a
 * half times the usual portion (whole units for countable foods).
 */
export function pantryToPlanRow(
  p: PantryItem,
  date: string,
  meal: Meal,
  position: number,
): Omit<PlanItem, 'id' | 'logged_entry_id'> {
  const unit = p.unit_name && p.unit_g ? p.unit_g : null;
  const snap = (g: number) => (unit ? Math.max(unit, Math.round(g / unit) * unit) : round1(g));
  const typical = snap(p.portion_g);
  const min = unit ? Math.min(typical, snap(p.portion_g * 0.5)) : round1(p.portion_g * 0.5);
  const max = Math.min(5000, Math.max(typical, snap(p.portion_g * 1.5)));
  return {
    date,
    meal,
    position,
    name: p.name,
    kcal_100g: p.kcal_100g,
    protein_100g: p.protein_100g,
    carbs_100g: p.carbs_100g,
    fat_100g: p.fat_100g,
    min_g: min,
    typical_g: typical,
    max_g: max,
    unit_name: p.unit_name,
    unit_g: p.unit_g,
    fixed_g: null,
    source: p.source,
    source_ref: p.source_ref,
  };
}
