import { addDays } from './dates';
import type { MealKey } from './meals';
import type { Activity, Goal, Intensity, Lifestyle, Sex } from './nutrition';
import { supabase } from './supabase';

export type Meal = MealKey;

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
  /** Custom meal names in display order; null = Breakfast/Lunch/Dinner/Snacks. */
  meal_slots: { key: Meal; label: string }[] | null;
  /** Intermittent-fasting eating window as "HH:MM"; both null when not fasting. */
  eating_window_start: string | null;
  eating_window_end: string | null;
  /** Accepted correction to estimated maintenance calories (from weigh-ins). */
  maintenance_adjust_kcal: number;
}

export interface TrainingSession {
  id: string;
  date: string;
  activity: Activity;
  duration_min: number;
  intensity: Intensity;
  kcal_override: number | null;
  /** Total calories WHOOP recorded, once the session is done. */
  actual_kcal: number | null;
  actual_duration_min: number | null;
  /** Exact WHOOP activity name it was picked as, e.g. "Running". */
  whoop_activity: string | null;
  notes: string | null;
  /** Local start time "HH:MM", if given (used to time meals around training). */
  start_time?: string | null;
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
    meal_slots: p.meal_slots ?? null,
    // Postgres time comes back as "HH:MM:SS".
    eating_window_start: p.eating_window_start ? p.eating_window_start.slice(0, 5) : null,
    eating_window_end: p.eating_window_end ? p.eating_window_end.slice(0, 5) : null,
    // 0 until the burn-correction migration is applied.
    maintenance_adjust_kcal: p.maintenance_adjust_kcal == null ? 0 : num(p.maintenance_adjust_kcal),
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

const SESSION_COLUMNS =
  'id,date,activity,duration_min,intensity,kcal_override,actual_kcal,actual_duration_min,whoop_activity,notes,start_time';

// Postgres time comes back as "HH:MM:SS".
const normaliseSession = (s: TrainingSession): TrainingSession => ({ ...s, start_time: s.start_time ? s.start_time.slice(0, 5) : null });

export async function listSessions(from: string, to: string): Promise<TrainingSession[]> {
  const res = await supabase
    .from('training_sessions')
    .select(SESSION_COLUMNS)
    .gte('date', from)
    .lte('date', to)
    .order('date')
    .order('created_at');
  return (unwrap(res) as TrainingSession[]).map(normaliseSession);
}

export async function getSession(id: string): Promise<TrainingSession> {
  const res = await supabase
    .from('training_sessions')
    .select(SESSION_COLUMNS)
    .eq('id', id)
    .single();
  return normaliseSession(unwrap(res) as TrainingSession);
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


// ───────────── diary-only days ─────────────

/** Dates marked "diary only" (food logged for the record, not counted). Empty if the table isn't there yet. */
export async function listDiaryDays(from: string, to: string): Promise<string[]> {
  const res = await supabase.from('diary_days').select('date').gte('date', from).lte('date', to);
  if (res.error) return [];
  return (res.data as { date: string }[]).map((d) => d.date);
}

export async function setDiaryDay(date: string, diaryOnly: boolean): Promise<void> {
  const res = diaryOnly
    ? await supabase.from('diary_days').upsert({ date }, { onConflict: 'user_id,date', ignoreDuplicates: true })
    : await supabase.from('diary_days').delete().eq('date', date);
  if (res.error) throw new Error(res.error.message);
}

// ───────────── weigh-ins ─────────────

export interface WeighInRow {
  id: string;
  date: string;
  weight_kg: number;
}

export async function listWeighIns(from: string): Promise<WeighInRow[]> {
  const res = await supabase.from('weigh_ins').select('id,date,weight_kg').gte('date', from).order('date');
  if (res.error) throw new Error(res.error.message);
  return (res.data as unknown as WeighInRow[]).map((w) => ({ ...w, weight_kg: Number(w.weight_kg) }));
}

/** One weigh-in per day: logging again replaces that day's value. */
export async function saveWeighIn(date: string, weightKg: number): Promise<void> {
  const res = await supabase
    .from('weigh_ins')
    .upsert({ date, weight_kg: weightKg }, { onConflict: 'user_id,date' });
  if (res.error) throw new Error(res.error.message);
}

export async function deleteWeighIn(id: string): Promise<void> {
  const res = await supabase.from('weigh_ins').delete().eq('id', id);
  if (res.error) throw new Error(res.error.message);
}

// ───────────── WHOOP history ─────────────

export interface WhoopWorkoutRow {
  started_at: string;
  date: string;
  activity_name: string;
  activity: Activity;
  duration_min: number;
  kcal: number;
}

/** Recent imported workouts (enough to learn burn rates). */
export async function listWhoopWorkouts(limit = 400): Promise<WhoopWorkoutRow[]> {
  const res = await supabase
    .from('whoop_workouts')
    .select('started_at,date,activity_name,activity,duration_min,kcal')
    .order('started_at', { ascending: false })
    .limit(limit);
  if (res.error) throw new Error(res.error.message);
  return (res.data as unknown as WhoopWorkoutRow[]).map((w) => ({ ...w, duration_min: Number(w.duration_min) }));
}

export async function upsertWhoopWorkouts(
  rows: (Omit<WhoopWorkoutRow, 'started_at'> & { started_at: string; strain: number | null; avg_hr: number | null })[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += 500) {
    const res = await supabase
      .from('whoop_workouts')
      .upsert(rows.slice(i, i + 500), { onConflict: 'user_id,started_at' });
    if (res.error) throw new Error(res.error.message);
  }
}

/** Sessions in a date range that haven't been confirmed with an actual burn. */
export async function listUnconfirmedSessions(from: string, to: string): Promise<TrainingSession[]> {
  const res = await supabase
    .from('training_sessions')
    .select(SESSION_COLUMNS)
    .gte('date', from)
    .lte('date', to)
    .is('actual_kcal', null);
  if (res.error) throw new Error(res.error.message);
  return res.data as unknown as TrainingSession[];
}

export async function confirmSession(id: string, actualKcal: number, actualDurationMin: number | null): Promise<void> {
  const res = await supabase
    .from('training_sessions')
    .update({ actual_kcal: Math.round(actualKcal), actual_duration_min: actualDurationMin })
    .eq('id', id);
  if (res.error) throw new Error(res.error.message);
}
