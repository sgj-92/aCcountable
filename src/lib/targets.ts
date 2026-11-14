import { isProfileComplete, type Profile, type TrainingSession } from './api';
import { ageOn } from './dates';
import { dayTarget, sessionBurn, type BodyStats, type DayTarget, type TargetSettings } from './nutrition';

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

const toInput = (s: TrainingSession) => ({
  activity: s.activity,
  durationMin: s.duration_min,
  intensity: s.intensity,
  kcalOverride: s.kcal_override,
});

/** Target for one day given that day's sessions; null until the profile is filled in. */
export function targetFor(profile: Profile, date: string, sessions: TrainingSession[]): DayTarget | null {
  const stats = statsFor(profile, date);
  if (!stats) return null;
  return dayTarget(
    stats,
    settingsFor(profile),
    sessions.filter((s) => s.date === date).map(toInput),
  );
}

/** kcal a single session adds to the day (after the eat-back percentage). */
export function sessionKcal(profile: Profile, session: TrainingSession): number | null {
  if (!profile.weight_kg) return null;
  return Math.round((sessionBurn(toInput(session), profile.weight_kg) * profile.training_eat_back_pct) / 100);
}
