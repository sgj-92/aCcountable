import { addDays } from './dates';
import type { Activity, Goal, Intensity, Lifestyle, Sex } from './nutrition';
import { supabase } from './supabase';

export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export const MEALS: Meal[] = ['breakfast', 'lunch', 'dinner', 'snack'];
export const MEAL_LABELS: Record<Meal, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snacks',
};

export interface Profile {
  id: string;
  display_name: string | null;
  sex: Sex | null;
  birth_date: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  lifestyle: Lifestyle;
  goal: Goal;
  goal_rate_kg_per_week: number;
  protein_g_per_kg: number;
  fat_pct: number;
  training_eat_back_pct: number;
}

export interface TrainingSession {
  id: string;
  date: string;
  activity: Activity;
  duration_min: number;
  intensity: Intensity;
  kcal_override: number | null;
  notes: string | null;
}

export interface FoodEntry {
  id: string;
  date: string;
  meal: Meal;
  name: string;
  serving: string | null;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  /** Weight eaten in grams, when known (weighed foods and photo estimates). */
  grams: number | null;
  source: 'manual' | 'photo' | 'usda' | 'off';
  /** USDA fdcId or Open Food Facts barcode. */
  source_ref: string | null;
  ai_confidence: 'low' | 'medium' | 'high' | null;
  created_at: string;
}

export type NewTrainingSession = Omit<TrainingSession, 'id'>;
export type NewFoodEntry = Omit<FoodEntry, 'id' | 'created_at'>;

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

// Postgres numeric can arrive as a string depending on precision; normalise.
const num = (v: unknown) => (v == null ? v : Number(v)) as number;

function normaliseProfile(p: Profile): Profile {
  return {
    ...p,
    height_cm: p.height_cm == null ? null : num(p.height_cm),
    weight_kg: p.weight_kg == null ? null : num(p.weight_kg),
    goal_rate_kg_per_week: num(p.goal_rate_kg_per_week),
    protein_g_per_kg: num(p.protein_g_per_kg),
    fat_pct: num(p.fat_pct),
  };
}

function normaliseFood(f: FoodEntry): FoodEntry {
  return {
    ...f,
    protein_g: num(f.protein_g),
    carbs_g: num(f.carbs_g),
    fat_g: num(f.fat_g),
    grams: f.grams == null ? null : num(f.grams),
  };
}

export function isProfileComplete(p: Profile | null | undefined): p is Profile & {
  sex: Sex;
  birth_date: string;
  height_cm: number;
  weight_kg: number;
} {
  return !!p && !!p.sex && !!p.birth_date && !!p.height_cm && !!p.weight_kg;
}

// ───────────── profile ─────────────

export async function getProfile(): Promise<Profile> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Not signed in');
  const res = await supabase.from('profiles').select('*').eq('id', auth.user.id).maybeSingle();
  if (res.error) throw new Error(res.error.message);
  const existing = res.data as unknown as Profile | null;
  if (existing) return normaliseProfile(existing);
  // Trigger normally creates it; fall back in case the account predates the trigger.
  const created = unwrap(await supabase.from('profiles').insert({ id: auth.user.id }).select().single());
  return normaliseProfile(created as unknown as Profile);
}

export async function updateProfile(id: string, patch: Partial<Omit<Profile, 'id'>>): Promise<Profile> {
  const res = await supabase.from('profiles').update(patch).eq('id', id).select().single();
  return normaliseProfile(unwrap(res) as Profile);
}

// ───────────── training ─────────────

export async function listSessions(from: string, to: string): Promise<TrainingSession[]> {
  const res = await supabase
    .from('training_sessions')
    .select('id,date,activity,duration_min,intensity,kcal_override,notes')
    .gte('date', from)
    .lte('date', to)
    .order('date')
    .order('created_at');
  return unwrap(res) as TrainingSession[];
}

export async function getSession(id: string): Promise<TrainingSession> {
  const res = await supabase
    .from('training_sessions')
    .select('id,date,activity,duration_min,intensity,kcal_override,notes')
    .eq('id', id)
    .single();
  return unwrap(res) as TrainingSession;
}

export async function saveSession(session: NewTrainingSession, id?: string): Promise<void> {
  const res = id
    ? await supabase.from('training_sessions').update(session).eq('id', id)
    : await supabase.from('training_sessions').insert(session);
  if (res.error) throw new Error(res.error.message);
}

export async function deleteSession(id: string): Promise<void> {
  const res = await supabase.from('training_sessions').delete().eq('id', id);
  if (res.error) throw new Error(res.error.message);
}

/** Copy every session from the week before `weekStart` into the week of `weekStart`. */
export async function copyPreviousWeek(weekStart: string): Promise<number> {
  const prev = await listSessions(addDays(weekStart, -7), addDays(weekStart, -1));
  if (prev.length === 0) return 0;
  const rows: NewTrainingSession[] = prev.map(({ id: _id, ...s }) => ({ ...s, date: addDays(s.date, 7) }));
  const res = await supabase.from('training_sessions').insert(rows);
  if (res.error) throw new Error(res.error.message);
  return rows.length;
}

// ───────────── food ─────────────

const FOOD_COLUMNS =
  'id,date,meal,name,serving,kcal,protein_g,carbs_g,fat_g,grams,source,source_ref,ai_confidence,created_at';

export async function listFood(from: string, to: string): Promise<FoodEntry[]> {
  const res = await supabase
    .from('food_entries')
    .select(FOOD_COLUMNS)
    .gte('date', from)
    .lte('date', to)
    .order('created_at');
  return (unwrap(res) as FoodEntry[]).map(normaliseFood);
}

export async function getFood(id: string): Promise<FoodEntry> {
  const res = await supabase.from('food_entries').select(FOOD_COLUMNS).eq('id', id).single();
  return normaliseFood(unwrap(res) as FoodEntry);
}

export async function addFood(entries: NewFoodEntry[]): Promise<void> {
  const res = await supabase.from('food_entries').insert(entries);
  if (res.error) throw new Error(res.error.message);
}

/** Adds one entry and returns its id. */
export async function addFoodEntry(entry: NewFoodEntry): Promise<string> {
  const res = await supabase.from('food_entries').insert(entry).select('id').single();
  if (res.error) throw new Error(res.error.message);
  return (res.data as { id: string }).id;
}

export async function updateFood(id: string, patch: Partial<NewFoodEntry>): Promise<void> {
  const res = await supabase.from('food_entries').update(patch).eq('id', id);
  if (res.error) throw new Error(res.error.message);
}

export async function deleteFood(id: string): Promise<void> {
  const res = await supabase.from('food_entries').delete().eq('id', id);
  if (res.error) throw new Error(res.error.message);
}

/** Most recently logged distinct foods, for quick re-adding. */
export async function recentFoods(limit = 15): Promise<FoodEntry[]> {
  const res = await supabase
    .from('food_entries')
    .select(FOOD_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(100);
  const seen = new Set<string>();
  const out: FoodEntry[] = [];
  for (const f of (unwrap(res) as FoodEntry[]).map(normaliseFood)) {
    const key = `${f.name.toLowerCase()}|${f.serving ?? ''}|${f.kcal}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
    if (out.length >= limit) break;
  }
  return out;
}

export function defaultMealForNow(d = new Date()): Meal {
  const h = d.getHours();
  if (h < 11) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h >= 17 && h < 22) return 'dinner';
  return 'snack';
}
