/**
 * Calorie + macro target engine.
 *
 * Model ("per-session burn"):
 *   daily target = base + training
 *   base         = BMR (Mifflin-St Jeor) × lifestyle factor ± goal adjustment
 *   training     = Σ net burn of each scheduled session
 *   net burn     = (MET − 1) × weight kg × hours × eat-back %
 *
 * The lifestyle factor deliberately EXCLUDES structured exercise (it describes
 * your job / step count only) so training is never double counted. Using
 * MET − 1 subtracts the resting energy already covered by BMR.
 *
 * Pure functions only — no I/O — so this module is easy to unit test.
 */

export type Sex = 'male' | 'female';
export type Lifestyle = 'sedentary' | 'light' | 'moderate' | 'active';
export type Goal = 'lose' | 'maintain' | 'gain';
export type Intensity = 'easy' | 'moderate' | 'hard';
export type Activity =
  | 'run'
  | 'cycle'
  | 'swim'
  | 'strength'
  | 'hiit'
  | 'row'
  | 'sport'
  | 'padel'
  | 'tennis'
  | 'walk'
  | 'yoga'
  | 'other';

export interface BodyStats {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
}

export interface TargetSettings {
  lifestyle: Lifestyle;
  goal: Goal;
  /** Rate of weight change for lose/gain goals, kg per week (positive number). */
  goalRateKgPerWeek: number;
  /** Protein target in grams per kg of body weight. */
  proteinGPerKg: number;
  /** Share of BASE (rest-day) calories that come from fat, in percent. */
  fatPct: number;
  /** Percent of estimated training burn to add to the day's target (0–100+). */
  trainingEatBackPct: number;
}

export interface SessionInput {
  activity: Activity;
  durationMin: number;
  intensity: Intensity;
  /** Planned estimate typed in by hand (total calories, as WHOOP shows them). */
  kcalOverride?: number | null;
  /** Confirmed after the session: total calories from WHOOP. Beats every estimate. */
  actualKcal?: number | null;
  /** Confirmed duration, if different from the plan. */
  actualDurationMin?: number | null;
}

/**
 * What a burn estimate can draw on. `bmr` lets total (gross) calories from
 * WHOOP be converted to the net extra burn the targets need; `rates` are the
 * person's own total kcal per minute per activity at moderate intensity,
 * learned from their WHOOP history.
 */
export interface BurnContext {
  weightKg: number;
  bmr?: number;
  rates?: Partial<Record<Activity, { kcalPerMin: number; samples: number }>>;
}

export type BurnSource = 'actual' | 'manual' | 'history' | 'formula';

export interface BurnDetail {
  /** Net kcal the session adds on top of resting burn. */
  net: number;
  source: BurnSource;
  /** WHOOP sessions the personal rate came from (source 'history'). */
  samples?: number;
}

export interface MacroTargets {
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface DayTarget extends MacroTargets {
  bmr: number;
  base: number;
  training: number;
  kcal: number;
  /** True when the goal deficit was capped so the base doesn't drop below BMR. */
  flooredAtBmr: boolean;
}

export const LIFESTYLE_FACTORS: Record<Lifestyle, number> = {
  sedentary: 1.2,
  light: 1.3,
  moderate: 1.4,
  active: 1.5,
};

export const LIFESTYLE_LABELS: Record<Lifestyle, { title: string; detail: string }> = {
  sedentary: { title: 'Sedentary', detail: 'Desk job, under ~5k steps' },
  light: { title: 'Lightly active', detail: '~5–8k steps a day' },
  moderate: { title: 'Moderately active', detail: 'On your feet a lot, ~8–12k steps' },
  active: { title: 'Very active', detail: 'Physical job, 12k+ steps' },
};

/** Approximate METs per activity/intensity (Compendium of Physical Activities). */
export const METS: Record<Activity, Record<Intensity, number>> = {
  run: { easy: 7.0, moderate: 9.8, hard: 11.8 },
  cycle: { easy: 5.8, moderate: 8.0, hard: 10.5 },
  swim: { easy: 5.8, moderate: 8.3, hard: 10.0 },
  strength: { easy: 3.5, moderate: 5.0, hard: 6.0 },
  hiit: { easy: 6.0, moderate: 8.0, hard: 10.0 },
  row: { easy: 4.8, moderate: 7.0, hard: 8.5 },
  sport: { easy: 5.0, moderate: 7.0, hard: 9.0 },
  padel: { easy: 5.0, moderate: 6.5, hard: 8.0 },
  tennis: { easy: 5.0, moderate: 7.0, hard: 8.0 },
  walk: { easy: 3.5, moderate: 4.5, hard: 6.0 },
  yoga: { easy: 2.5, moderate: 3.0, hard: 4.0 },
  other: { easy: 4.0, moderate: 6.0, hard: 8.0 },
};

export const ACTIVITY_LABELS: Record<Activity, string> = {
  run: 'Run',
  cycle: 'Cycle',
  swim: 'Swim',
  strength: 'Strength',
  hiit: 'HIIT',
  row: 'Row',
  sport: 'Team sport',
  padel: 'Padel',
  tennis: 'Tennis / racket',
  walk: 'Walk / hike',
  yoga: 'Yoga / mobility',
  other: 'Other',
};

export const KCAL_PER_KG_BODY_WEIGHT = 7700;

export const DEFAULT_SETTINGS: TargetSettings = {
  lifestyle: 'light',
  goal: 'maintain',
  goalRateKgPerWeek: 0.5,
  proteinGPerKg: 1.8,
  fatPct: 25,
  trainingEatBackPct: 100,
};

/** Mifflin-St Jeor basal metabolic rate, kcal/day. */
export function bmr({ sex, age, heightCm, weightKg }: BodyStats): number {
  const s = sex === 'male' ? 5 : -161;
  return 10 * weightKg + 6.25 * heightCm - 5 * age + s;
}

/** Daily kcal adjustment for the goal (negative for a deficit). */
export function goalAdjustment(goal: Goal, rateKgPerWeek: number): number {
  if (goal === 'maintain') return 0;
  const daily = (Math.abs(rateKgPerWeek) * KCAL_PER_KG_BODY_WEIGHT) / 7;
  return goal === 'lose' ? -daily : daily;
}

/**
 * Net kcal for one session (before the eat-back percentage), and where the
 * number came from. Preference: confirmed WHOOP calories → a hand-typed
 * estimate → the person's own WHOOP history for that activity → METs.
 */
export function sessionBurnDetail(session: SessionInput, ctx: BurnContext | number): BurnDetail {
  const c: BurnContext = typeof ctx === 'number' ? { weightKg: ctx } : ctx;
  const minutes = Math.max(0, session.actualDurationMin ?? session.durationMin);
  // Resting burn during the session is already in BMR, so take it out of totals.
  const resting = c.bmr ? (c.bmr / 1440) * minutes : 0;

  if (session.actualKcal != null && session.actualKcal >= 0) {
    return { net: Math.max(0, session.actualKcal - resting), source: 'actual' };
  }
  if (session.kcalOverride != null && session.kcalOverride >= 0) {
    return { net: Math.max(0, session.kcalOverride - resting), source: 'manual' };
  }
  const met = METS[session.activity]?.[session.intensity] ?? METS.other.moderate;
  const rate = c.rates?.[session.activity];
  if (rate && rate.samples > 0 && rate.kcalPerMin > 0) {
    // Personal moderate-intensity rate, scaled by how much harder/easier this intensity is.
    const scale = met / (METS[session.activity]?.moderate ?? met);
    return {
      net: Math.max(0, rate.kcalPerMin * scale * minutes - resting),
      source: 'history',
      samples: rate.samples,
    };
  }
  return { net: Math.max(0, (met - 1) * c.weightKg * (minutes / 60)), source: 'formula' };
}

/** Net kcal for one session (before the eat-back percentage). */
export function sessionBurn(session: SessionInput, ctx: BurnContext | number): number {
  return sessionBurnDetail(session, ctx).net;
}

export function baseTarget(stats: BodyStats, settings: TargetSettings) {
  const b = bmr(stats);
  const maintenance = b * LIFESTYLE_FACTORS[settings.lifestyle];
  const raw = maintenance + goalAdjustment(settings.goal, settings.goalRateKgPerWeek);
  const flooredAtBmr = raw < b;
  return { bmr: b, maintenance, base: flooredAtBmr ? b : raw, flooredAtBmr };
}

/**
 * Macros: protein is fixed by body weight, fat is a fixed gram amount derived
 * from the BASE (rest-day) target, and carbs fill the remainder. So extra
 * training calories land almost entirely in carbohydrate — i.e. you fuel the
 * work — while protein and fat stay steady day to day.
 */
export function macroTargets(
  kcal: number,
  base: number,
  weightKg: number,
  settings: Pick<TargetSettings, 'proteinGPerKg' | 'fatPct'>,
): MacroTargets {
  const proteinG = settings.proteinGPerKg * weightKg;
  const fatG = (base * settings.fatPct) / 100 / 9;
  const carbsG = Math.max(0, (kcal - proteinG * 4 - fatG * 9) / 4);
  return { proteinG, carbsG, fatG };
}

export function dayTarget(
  stats: BodyStats,
  settings: TargetSettings,
  sessions: SessionInput[],
  rates?: BurnContext['rates'],
): DayTarget {
  const { bmr: b, base, flooredAtBmr } = baseTarget(stats, settings);
  const ctx: BurnContext = { weightKg: stats.weightKg, bmr: b, rates };
  const rawTraining = sessions.reduce((sum, s) => sum + sessionBurn(s, ctx), 0);
  const training = (rawTraining * settings.trainingEatBackPct) / 100;
  const kcal = base + training;
  const macros = macroTargets(kcal, base, stats.weightKg, settings);
  return {
    bmr: Math.round(b),
    base: Math.round(base),
    training: Math.round(training),
    kcal: Math.round(kcal),
    proteinG: Math.round(macros.proteinG),
    carbsG: Math.round(macros.carbsG),
    fatG: Math.round(macros.fatG),
    flooredAtBmr,
  };
}

export interface Totals {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export function sumTotals(
  items: { kcal: number; protein_g: number; carbs_g: number; fat_g: number }[],
): Totals {
  return items.reduce<Totals>(
    (t, i) => ({
      kcal: t.kcal + (i.kcal || 0),
      proteinG: t.proteinG + (i.protein_g || 0),
      carbsG: t.carbsG + (i.carbs_g || 0),
      fatG: t.fatG + (i.fat_g || 0),
    }),
    { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );
}

/** kcal implied by macros (Atwater 4/4/9) — handy as a sanity check on entries. */
export function kcalFromMacros(proteinG: number, carbsG: number, fatG: number): number {
  return Math.round(proteinG * 4 + carbsG * 4 + fatG * 9);
}
