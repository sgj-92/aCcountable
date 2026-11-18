import { isProfileComplete, type Profile, type TrainingSession } from './api';
import { ageOn } from './dates';
import {
  ACTIVITY_LABELS,
  baseTarget,
  dayTarget,
  sessionBurnDetail,
  type BodyStats,
  type BurnContext,
  type BurnDetail,
  type DayTarget,
  type TargetSettings,
} from './nutrition';

export type Rates = BurnContext['rates'];

export function statsFor(profile: Profile, on: string): BodyStats | null {
  if (!isProfileComplete(profile)) return null;
  return {
    sex: profile.sex,
    age: ageOn(profile.birth_date, on),
    heightCm: profile.height_cm,
    weightKg: profile.weight_kg,
  };
}

export function settingsFor(profile: Profile): TargetSettings {
  return {
    lifestyle: profile.lifestyle,
    goal: profile.goal,
    goalRateKgPerWeek: profile.goal_rate_kg_per_week,
    proteinGPerKg: profile.protein_g_per_kg,
    fatPct: profile.fat_pct,
    trainingEatBackPct: profile.training_eat_back_pct,
  };
}

export const toInput = (s: TrainingSession) => ({
  activity: s.activity,
  durationMin: s.duration_min,
  intensity: s.intensity,
  kcalOverride: s.kcal_override,
  actualKcal: s.actual_kcal,
  actualDurationMin: s.actual_duration_min,
  whoopActivity: s.whoop_activity,
});

/** How a session is named on screen: its WHOOP activity if it has one. */
export function sessionLabel(s: Pick<TrainingSession, 'activity' | 'whoop_activity'>): string {
  return s.whoop_activity || ACTIVITY_LABELS[s.activity];
}

/** Target for one day given that day's sessions; null until the profile is filled in. */
export function targetFor(
  profile: Profile,
  date: string,
  sessions: TrainingSession[],
  rates?: Rates,
): DayTarget | null {
  const stats = statsFor(profile, date);
  if (!stats) return null;
  return dayTarget(
    stats,
    settingsFor(profile),
    sessions.filter((s) => s.date === date).map(toInput),
    rates,
  );
}

/** What a single session adds to its day (after the eat-back percentage), and where the number came from. */
export function sessionKcalDetail(
  profile: Profile,
  session: TrainingSession,
  rates?: Rates,
): (BurnDetail & { added: number }) | null {
  const stats = statsFor(profile, session.date);
  if (!stats) return null;
  const { bmr } = baseTarget(stats, settingsFor(profile));
  const d = sessionBurnDetail(toInput(session), { weightKg: stats.weightKg, bmr, rates });
  return { ...d, added: Math.round((d.net * profile.training_eat_back_pct) / 100) };
}

/** kcal a single session adds to the day (after the eat-back percentage). */
export function sessionKcal(profile: Profile, session: TrainingSession, rates?: Rates): number | null {
  return sessionKcalDetail(profile, session, rates)?.added ?? null;
}
