/**
 * Day types: presets agreed with a coach ("Rest day", "Padel day"). Each holds
 * the day's calorie and macro targets, the training it assumes, and the meals
 * (foods with set portions). Picking one for a date fills that day's plan and
 * planned sessions; the target is the agreed number, nudged only by the week
 * balance and by training that differs from what the day assumed.
 */
import { FunctionsHttpError } from '@supabase/supabase-js';

import type { Meal, NewTrainingSession, TrainingSession } from './api';
import type { PantryItem } from './pantry';
import type { Activity, DayTarget, Intensity } from './nutrition';
import type { PlanItem } from './plans';
import { supabase } from './supabase';

export interface DayTypeSession {
  activity: Activity;
  /** WHOOP activity name, so estimates use your own history ("Padel"). */
  whoop_activity: string | null;
  duration_min: number;
  intensity: Intensity;
}

export interface DayTypeFood {
  meal: Meal;
  name: string;
  /** Agreed portion in grams. */
  grams: number;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  unit_name: string | null;
  unit_g: number | null;
  pantry_id: string | null;
  source: 'ai' | 'usda' | 'off' | 'manual';
  source_ref: string | null;
}

export interface DayType {
  id: string;
  name: string;
  position: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  sessions: DayTypeSession[];
  meals: DayTypeFood[];
  notes: string | null;
}

export type NewDayType = Omit<DayType, 'id'>;

/** Sessions created from a day type carry this note, so switching day type can replace them. */
export const DAY_TYPE_NOTE = 'Planned with day type';

const COLUMNS = 'id,name,position,kcal,protein_g,carbs_g,fat_g,sessions,meals,notes';
const round1 = (n: number) => Math.round(n * 10) / 10;

function normalise(d: DayType): DayType {
  return { ...d, sessions: d.sessions ?? [], meals: (d.meals ?? []).map((m) => ({ ...m, grams: Number(m.grams) })) };
}

// ───────────── data ─────────────

/** Empty if the tables aren't there yet (migration not applied). */
export async function listDayTypes(): Promise<DayType[]> {
  const res = await supabase.from('day_types').select(COLUMNS).order('position').order('name');
  if (res.error) return [];
  return (res.data as unknown as DayType[]).map(normalise);
}

export async function getDayType(id: string): Promise<DayType> {
  const res = await supabase.from('day_types').select(COLUMNS).eq('id', id).single();
  if (res.error) throw new Error(res.error.message);
  return normalise(res.data as unknown as DayType);
}

export async function saveDayType(d: NewDayType, id?: string): Promise<string> {
  const res = id
    ? await supabase.from('day_types').update(d).eq('id', id).select('id').single()
    : await supabase.from('day_types').upsert(d, { onConflict: 'user_id,name' }).select('id').single();
  if (res.error) throw new Error(res.error.message);
  return (res.data as { id: string }).id;
}

export async function deleteDayType(id: string): Promise<void> {
  const res = await supabase.from('day_types').delete().eq('id', id);
  if (res.error) throw new Error(res.error.message);
}

/** date → day type id, for dates in [from, to]. Empty if the table isn't there yet. */
export async function listAssignments(from: string, to: string): Promise<Record<string, string>> {
  const res = await supabase.from('day_assignments').select('date,day_type_id').gte('date', from).lte('date', to);
  if (res.error) return {};
  return Object.fromEntries((res.data as { date: string; day_type_id: string }[]).map((a) => [a.date, a.day_type_id]));
}

/**
 * Sets (or clears) the day type for a date: records it, replaces the not-yet-eaten
 * plan with the day type's meals, and swaps the sessions a previous day type planned
 * for this one's (unless you've logged your own training that day).
 */
export async function assignDayType(date: string, dt: DayType | null): Promise<void> {
  const assign = dt
    ? await supabase.from('day_assignments').upsert({ date, day_type_id: dt.id }, { onConflict: 'user_id,date' })
    : await supabase.from('day_assignments').delete().eq('date', date);
  if (assign.error) throw new Error(assign.error.message);

  // Plan: drop what hasn't been eaten yet, then add the day type's meals after what has.
  const del = await supabase.from('plan_items').delete().eq('date', date).is('logged_entry_id', null);
  if (del.error) throw new Error(del.error.message);
  if (dt && dt.meals.length) {
    const kept = await supabase.from('plan_items').select('id', { count: 'exact', head: true }).eq('date', date);
    const rows = templatePlanRows(dt, date, kept.count ?? 0);
    const ins = await supabase.from('plan_items').insert(rows);
    if (ins.error) throw new Error(ins.error.message);
  }

  // Sessions: replace unconfirmed ones a day type planned; keep anything you logged yourself.
  const delS = await supabase
    .from('training_sessions')
    .delete()
    .eq('date', date)
    .is('actual_kcal', null)
    .eq('notes', DAY_TYPE_NOTE);
  if (delS.error) throw new Error(delS.error.message);
  if (dt && dt.sessions.length) {
    const left = await supabase.from('training_sessions').select('id', { count: 'exact', head: true }).eq('date', date);
    if ((left.count ?? 0) === 0) {
      const ins = await supabase.from('training_sessions').insert(templateSessions(dt, date));
      if (ins.error) throw new Error(ins.error.message);
    }
  }
}

interface ParsedFood {
  meal: Meal;
  food: string;
  pantry_name: string;
  grams: number;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  unit_name: string;
  unit_g: number;
}

/**
 * Turns a plan agreed with a coach (pasted text) into draft day types, using the
 * pantry's own values for foods that match it.
 */
export async function parseDayTypes(
  text: string,
  meals: { key: string; label: string }[],
  pantry: PantryItem[],
  whoopActivities: string[],
): Promise<{ dayTypes: NewDayType[]; notes: string }> {
  const { data, error } = await supabase.functions.invoke<{
    day_types: (Omit<NewDayType, 'meals' | 'position' | 'notes'> & { meals: ParsedFood[] })[];
    notes: string;
  }>('parse-day-types', {
    body: {
      text,
      meals,
      pantry: pantry.map((p) => ({
        name: p.name,
        kcal_100g: p.kcal_100g,
        protein_100g: p.protein_100g,
        carbs_100g: p.carbs_100g,
        fat_100g: p.fat_100g,
        portion_g: p.portion_g,
        unit_name: p.unit_name,
      })),
      whoop_activities: whoopActivities,
    },
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
    if (!message && /not found|404/i.test(error.message)) message = 'The day-type reader isn’t deployed yet.';
    throw new Error(message ?? (error.message || 'Reading the plan failed'));
  }
  const byName = new Map(pantry.map((p) => [p.name.toLowerCase(), p]));
  const dayTypes = (data?.day_types ?? []).map((d, i) => ({
    name: d.name,
    position: i,
    kcal: d.kcal,
    protein_g: d.protein_g,
    carbs_g: d.carbs_g,
    fat_g: d.fat_g,
    sessions: d.sessions,
    notes: null,
    meals: d.meals.map((m): DayTypeFood => {
      const p = m.pantry_name ? byName.get(m.pantry_name.toLowerCase()) : undefined;
      return p
        ? {
            meal: m.meal,
            name: p.name,
            grams: m.grams,
            kcal_100g: p.kcal_100g,
            protein_100g: p.protein_100g,
            carbs_100g: p.carbs_100g,
            fat_100g: p.fat_100g,
            unit_name: p.unit_name,
            unit_g: p.unit_g,
            pantry_id: p.id,
            source: p.source,
            source_ref: p.source_ref,
          }
        : {
            meal: m.meal,
            name: m.food,
            grams: m.grams,
            kcal_100g: m.kcal_100g,
            protein_100g: m.protein_100g,
            carbs_100g: m.carbs_100g,
            fat_100g: m.fat_100g,
            unit_name: m.unit_name || null,
            unit_g: m.unit_g || null,
            pantry_id: null,
            source: 'ai',
            source_ref: null,
          };
    }),
  }));
  return { dayTypes, notes: data?.notes ?? '' };
}

// ───────────── pure ─────────────

/** The day type's assumed training as sessions on `date`. */
export function templateSessions(dt: Pick<DayType, 'sessions'>, date: string): NewTrainingSession[] {
  return dt.sessions.map((s) => ({
    date,
    activity: s.activity,
    duration_min: s.duration_min,
    intensity: s.intensity,
    kcal_override: null,
    actual_kcal: null,
    actual_duration_min: null,
    whoop_activity: s.whoop_activity,
    notes: DAY_TYPE_NOTE,
  }));
}

/** Same, as full session objects (for estimating what the day type's training adds). */
export function templateSessionObjects(dt: Pick<DayType, 'sessions'>, date: string): TrainingSession[] {
  return templateSessions(dt, date).map((s, i) => ({ ...s, id: `template-${i}` }));
}

/**
 * The day type's meals as plan items. The agreed portion is the typical amount;
 * the planner may move between half and one and a half times it (whole units for
 * countable foods) to re-balance the day.
 */
export function templatePlanRows(
  dt: Pick<DayType, 'meals'>,
  date: string,
  startPosition: number,
): Omit<PlanItem, 'id' | 'logged_entry_id'>[] {
  return dt.meals.map((f, n) => {
    const unit = f.unit_name && f.unit_g ? f.unit_g : null;
    const snap = (g: number) => (unit ? Math.max(unit, Math.round(g / unit) * unit) : round1(g));
    const typical = snap(f.grams);
    const min = unit ? Math.min(typical, snap(f.grams * 0.5)) : round1(f.grams * 0.5);
    const max = Math.min(5000, Math.max(typical, snap(f.grams * 1.5)));
    return {
      date,
      meal: f.meal,
      position: startPosition + n,
      name: f.name,
      kcal_100g: f.kcal_100g,
      protein_100g: f.protein_100g,
      carbs_100g: f.carbs_100g,
      fat_100g: f.fat_100g,
      min_g: min,
      typical_g: typical,
      max_g: max,
      unit_name: f.unit_name,
      unit_g: f.unit_g,
      fixed_g: null,
      source: f.source,
      source_ref: f.source_ref,
    };
  });
}

/** Totals of the day type's meals at their agreed portions. */
export function mealTotals(dt: Pick<DayType, 'meals'>) {
  return dt.meals.reduce(
    (t, f) => ({
      kcal: t.kcal + (f.kcal_100g * f.grams) / 100,
      protein_g: t.protein_g + (f.protein_100g * f.grams) / 100,
      carbs_g: t.carbs_g + (f.carbs_100g * f.grams) / 100,
      fat_g: t.fat_g + (f.fat_100g * f.grams) / 100,
    }),
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );
}

/**
 * The day's target when it follows a day type: the agreed kcal, plus the difference
 * between the training actually logged that day and the training the day type assumed
 * (both after the eat-back setting). With no training logged, it's exactly as agreed.
 *
 * @param raw            the formula's target for the day (used for BMR and the floor flag)
 * @param loggedTraining what the day's logged sessions add (raw.training)
 * @param templateTraining what the day type's assumed sessions would add
 */
export function dayTypeTarget(
  dt: Pick<DayType, 'name' | 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g'>,
  raw: DayTarget,
  hasLoggedSessions: boolean,
  templateTraining: number,
): DayTarget {
  const training = hasLoggedSessions ? Math.round(raw.training - templateTraining) : 0;
  const kcal = dt.kcal + training;
  return {
    ...raw,
    base: dt.kcal,
    training,
    kcal,
    ...dayTypeMacros(dt, kcal),
    flooredAtBmr: false,
    dayType: dt.name,
  };
}

/** Agreed protein and fat; carbs take any change in calories (as on training days). */
export function dayTypeMacros(dt: Pick<DayType, 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g'>, kcal: number) {
  const carbs = Math.max(0, dt.carbs_g + (kcal - dt.kcal) / 4);
  return { proteinG: Math.round(dt.protein_g), carbsG: Math.round(carbs), fatG: Math.round(dt.fat_g) };
}
