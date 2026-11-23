/**
 * Builds day types from your goal instead of a coach's plan: a rest day at your
 * goal's rest-day target, and a day for each of your usual training sessions at
 * that target plus what the session burns (after the eat-back setting). Protein
 * and fat stay put, so training days are higher-carb days. Each day's meals come
 * from the pantry foods filed under each meal, sized to hit that day's target.
 */
import type { Profile, TrainingSession } from './api';
import type { DayTypeFood, DayTypeSession, NewDayType } from './day-types';
import type { DayTarget } from './nutrition';
import { pantryToPlanRow, type PantryItem } from './pantry';
import { solvePlan } from './planner';
import { toPlanFood } from './plans';
import { targetFor, type Rates } from './targets';
import type { ActivityRate } from './whoop';

const MAX_TRAINING_DAYS = 3;

function sessionOn(date: string, s: DayTypeSession): TrainingSession {
  return { id: 'build', date, ...s, kcal_override: null, actual_kcal: null, actual_duration_min: null, notes: null };
}

/** Pantry foods filed under a meal, at portions that hit the target. */
export function mealsFor(target: DayTarget, pantry: PantryItem[], date: string): DayTypeFood[] {
  const foods = pantry.filter((p) => p.meals.length > 0);
  if (foods.length === 0) return [];
  // Building from scratch, so portions may range further than day-to-day re-balancing allows.
  const rows = foods.map((p, i) => {
    const r = pantryToPlanRow(p, date, p.meals[0], i);
    const unit = p.unit_g && p.unit_name ? p.unit_g : null;
    const snap = (g: number) => (unit ? Math.max(unit, Math.round(g / unit) * unit) : Math.round(g));
    return { ...r, min_g: Math.min(r.typical_g, snap(p.portion_g * 0.25)), max_g: Math.min(5000, snap(p.portion_g * 2.5)), id: p.id, logged_entry_id: null };
  });
  const goal = { kcal: target.kcal, protein_g: target.proteinG, carbs_g: target.carbsG, fat_g: target.fatG };
  const solution = solvePlan(rows.map(toPlanFood), goal, goal);
  return rows.map((r, i) => ({
    meal: r.meal,
    name: r.name,
    grams: solution.grams[r.id] ?? r.typical_g,
    kcal_100g: r.kcal_100g,
    protein_100g: r.protein_100g,
    carbs_100g: r.carbs_100g,
    fat_100g: r.fat_100g,
    unit_name: r.unit_name,
    unit_g: r.unit_g,
    pantry_id: foods[i].id,
    source: r.source,
    source_ref: r.source_ref,
  }));
}

/** Your usual training: the most-logged WHOOP activities at their typical length (at least 3 sessions each). */
export function usualSessions(whoopNamed: ActivityRate[]): DayTypeSession[] {
  return whoopNamed
    .filter((r) => r.samples >= 3 && r.typicalMin >= 15)
    .sort((a, b) => b.samples - a.samples)
    .slice(0, MAX_TRAINING_DAYS)
    .map((r) => ({ activity: r.activity, whoop_activity: r.label, duration_min: Math.round(r.typicalMin), intensity: 'moderate' as const }));
}

export function buildDayTypes(
  profile: Profile,
  rates: Rates,
  whoopNamed: ActivityRate[],
  pantry: PantryItem[],
  date: string,
): NewDayType[] {
  const rest = targetFor(profile, date, [], rates);
  if (!rest) return [];
  const training = usualSessions(whoopNamed);
  // No WHOOP history yet: one generic hour of moderate training.
  const kinds: { name: string; sessions: DayTypeSession[] }[] = [
    { name: 'Rest day', sessions: [] },
    ...(training.length
      ? training.map((s) => ({ name: `${s.whoop_activity} day`.slice(0, 40), sessions: [s] }))
      : [{ name: 'Training day', sessions: [{ activity: 'strength' as const, whoop_activity: null, duration_min: 60, intensity: 'moderate' as const }] }]),
  ];
  return kinds.map((k, i) => {
    const t = k.sessions.length ? targetFor(profile, date, k.sessions.map((s) => sessionOn(date, s)), rates)! : rest;
    return {
      name: k.name,
      position: i,
      kcal: t.kcal,
      protein_g: t.proteinG,
      carbs_g: t.carbsG,
      fat_g: t.fatG,
      sessions: k.sessions,
      meals: mealsFor(t, pantry, date),
      notes: null,
    };
  });
}
