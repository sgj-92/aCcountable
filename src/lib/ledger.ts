/**
 * Two-way sync with Ledger (Shaun's day-planning app). The contract is in
 * docs/ledger-sync.md; this file builds what aCcountable sends for a day.
 *
 * aCcountable is the source of truth for food: meals, what was eaten and the
 * day's nutrition go to Ledger. Training plans and weight go both ways. Ledger
 * sends back its training, the meals ticked done and weigh-ins.
 */
import type { FoodEntry, TrainingSession } from './api';
import { formatClock } from './fasting';
import type { MealTime } from './meal-times';
import type { Activity } from './nutrition';
import { amountLabel, type PlanItem } from './plans';
import { sessionLabel } from './targets';

export type LedgerType = 'padel' | 'resistance' | 'cardio' | 'hiit' | 'yoga';

export interface LedgerTraining {
  /** "acc:session:<id>" for sessions made in aCcountable, "ledger:<date>:<type>" for Ledger's. */
  ref: string;
  type: LedgerType;
  /** e.g. "Padel" or "Running", as named in aCcountable. */
  title: string;
  startTime: string | null;
  durationMin: number;
}

export interface LedgerMealFood {
  name: string;
  amount: string;
  kcal: number;
  done: boolean;
}

export interface LedgerMeal {
  /** "acc:meal:<date>:<meal key>" */
  ref: string;
  name: string;
  time: string | null;
  tag: 'pre' | 'post' | null;
  kcal: number;
  done: boolean;
  foods: LedgerMealFood[];
  /** Planned foods still to eat and the amounts sent, so a tick in Ledger logs exactly these. */
  planned: { planItemId: string; grams: number }[];
}

export interface LedgerNutrition {
  eatenKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  targetKcal: number;
  targetProteinG: number;
  targetCarbsG: number;
  targetFatG: number;
  dayType: string | null;
  diaryOnly: boolean;
  /** What was eaten, one line per food, e.g. "Meal 1: 2 eggs · 100 g (143 kcal)". */
  diary: string[];
}

/** The day's carbs, for Ledger's Nutrition Plan. aCcountable has no whole-day fast, so never "fasting". */
export type CarbLevel = 'fasting' | 'low' | 'normal' | 'high';

/**
 * How the day's carb target compares with a rest day's (training calories go to carbs):
 * a rest day is low; training, or carbs up to 30% above rest, is normal; more is high.
 * Null on a diary-only day or with no target.
 */
export function carbLevel(i: { carbsG: number | null; restCarbsG: number | null; hasTraining: boolean; diaryOnly: boolean }): CarbLevel | null {
  if (i.diaryOnly || i.carbsG == null || !i.restCarbsG || i.restCarbsG <= 0) return null;
  const ratio = i.carbsG / i.restCarbsG;
  if (ratio >= 1.3) return 'high';
  if (ratio >= 1.1 || i.hasTraining) return 'normal';
  return 'low';
}

/** aCcountable → Ledger: one day. */
export interface LedgerSnapshot {
  v: 1;
  origin: 'accountable';
  date: string;
  /** Sets Ledger's Nutrition Plan on days marked "TBD by aCcountable"; null = no opinion. */
  carbLevel: CarbLevel | null;
  training: LedgerTraining[];
  meals: LedgerMeal[];
  nutrition: LedgerNutrition | null;
  weightKg: number | null;
}

/** Ledger → aCcountable: one day. */
export interface LedgerInbound {
  v: 1;
  origin: 'ledger';
  date: string;
  training: LedgerTraining[];
  /** Refs of aCcountable meals ticked done in Ledger. */
  mealsDone: string[];
  weightKg: number | null;
}

const TO_LEDGER: Record<Activity, LedgerType> = {
  padel: 'padel',
  tennis: 'padel',
  strength: 'resistance',
  hiit: 'hiit',
  yoga: 'yoga',
  run: 'cardio',
  cycle: 'cardio',
  swim: 'cardio',
  row: 'cardio',
  walk: 'cardio',
  sport: 'cardio',
  other: 'cardio',
};

const FROM_LEDGER: Record<LedgerType, Activity> = {
  padel: 'padel',
  resistance: 'strength',
  hiit: 'hiit',
  yoga: 'yoga',
  cardio: 'other',
};

export const toLedgerType = (a: Activity): LedgerType => TO_LEDGER[a] ?? 'cardio';
export const fromLedgerType = (t: string): Activity => FROM_LEDGER[t as LedgerType] ?? 'other';

export const sessionRef = (id: string) => `acc:session:${id}`;
export const mealRef = (date: string, meal: string) => `acc:meal:${date}:${meal}`;

/** A stable string for a snapshot, to skip sending a day that hasn't changed. */
export function snapshotKey(s: LedgerSnapshot): string {
  return JSON.stringify(s);
}

// ───────────── building a day's snapshot ─────────────


export interface SnapshotInput {
  date: string;
  sessions: TrainingSession[];
  slots: { key: string; label: string }[];
  food: FoodEntry[];
  plan: PlanItem[];
  isLogged: (i: PlanItem) => boolean;
  gramsFor: (i: PlanItem) => number;
  times: Record<string, MealTime> | null;
  target: { kcal: number; proteinG: number; carbsG: number; fatG: number } | null;
  dayType: string | null;
  diaryOnly: boolean;
  weightKg: number | null;
  /** A rest day's carb target for the same date, to rate the day's carbs. */
  restCarbsG: number | null;
}

const r = Math.round;

export function buildLedgerSnapshot(i: SnapshotInput): LedgerSnapshot {
  const training: LedgerTraining[] = i.sessions
    .filter((s) => s.date === i.date)
    .map((s) => ({
      ref: s.external_ref ?? sessionRef(s.id),
      type: toLedgerType(s.activity),
      title: sessionLabel(s),
      startTime: s.start_time ?? null,
      durationMin: s.actual_duration_min ?? s.duration_min,
    }));

  const meals: LedgerMeal[] = i.slots
    .map((slot) => {
      const eaten = i.food.filter((f) => f.meal === slot.key);
      const open = i.plan.filter((p) => p.meal === slot.key && !i.isLogged(p));
      const foods: LedgerMealFood[] = [
        ...eaten.map((f) => ({ name: f.name, amount: f.serving ?? '', kcal: r(f.kcal), done: true })),
        ...open.map((p) => {
          const g = i.gramsFor(p);
          return { name: p.name, amount: amountLabel(p, g), kcal: r((p.kcal_100g * g) / 100), done: false };
        }),
      ];
      const t = i.times?.[slot.key];
      return {
        ref: mealRef(i.date, slot.key),
        name: slot.label,
        time: t ? formatClock(t.minutes) : null,
        tag: t?.tag ?? null,
        kcal: foods.reduce((sum, f) => sum + f.kcal, 0),
        done: eaten.length > 0 && open.length === 0,
        foods,
        planned: open.map((p) => ({ planItemId: p.id, grams: i.gramsFor(p) })),
      };
    })
    .filter((m) => m.foods.length > 0);

  const totals = i.food.reduce(
    (t, f) => ({ kcal: t.kcal + f.kcal, p: t.p + f.protein_g, c: t.c + f.carbs_g, f: t.f + f.fat_g }),
    { kcal: 0, p: 0, c: 0, f: 0 },
  );
  const label = (key: string) => i.slots.find((s) => s.key === key)?.label ?? key;
  const nutrition: LedgerNutrition | null =
    i.food.length || i.target
      ? {
          eatenKcal: r(totals.kcal),
          proteinG: r(totals.p),
          carbsG: r(totals.c),
          fatG: r(totals.f),
          targetKcal: r(i.target?.kcal ?? 0),
          targetProteinG: r(i.target?.proteinG ?? 0),
          targetCarbsG: r(i.target?.carbsG ?? 0),
          targetFatG: r(i.target?.fatG ?? 0),
          dayType: i.dayType,
          diaryOnly: i.diaryOnly,
          diary: i.food.map((f) => `${label(f.meal)}: ${f.name}${f.serving ? ` · ${f.serving}` : ''} (${r(f.kcal)} kcal)`),
        }
      : null;

  const level = carbLevel({
    carbsG: i.target?.carbsG ?? null,
    restCarbsG: i.restCarbsG,
    hasTraining: training.length > 0,
    diaryOnly: i.diaryOnly,
  });
  return { v: 1, origin: 'accountable', date: i.date, carbLevel: level, training, meals, nutrition, weightKg: i.weightKg };
}
