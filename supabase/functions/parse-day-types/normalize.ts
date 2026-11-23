// Pure clean-up of the AI's day types, shared with the Deno tests.

export const MEALS = ['breakfast', 'lunch', 'dinner', 'snack', 'meal5', 'meal6'] as const;
export type Meal = (typeof MEALS)[number];
export const ACTIVITIES = ['run', 'cycle', 'swim', 'strength', 'hiit', 'row', 'sport', 'padel', 'tennis', 'walk', 'yoga', 'other'] as const;
export const INTENSITIES = ['easy', 'moderate', 'hard'] as const;

export interface RawDayType {
  name: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  sessions: { activity: string; whoop_activity: string; duration_min: number; intensity: string }[];
  meals: {
    meal: string;
    food: string;
    pantry_name: string;
    grams: number;
    kcal_100g: number;
    protein_100g: number;
    carbs_100g: number;
    fat_100g: number;
    unit_name: string;
    unit_g: number;
  }[];
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));
const r1 = (n: number) => Math.round(n * 10) / 10;

export function normalizeDayType(d: RawDayType, mealKeys: readonly string[]) {
  const name = (d.name ?? '').trim().slice(0, 40);
  if (!name) return null;
  const meals = (d.meals ?? [])
    .filter((m) => (m.food ?? '').trim() && m.grams > 0)
    .map((m) => ({
      meal: (mealKeys.includes(m.meal) ? m.meal : mealKeys[0]) as Meal,
      food: m.food.trim().slice(0, 200),
      pantry_name: (m.pantry_name ?? '').trim(),
      grams: r1(clamp(m.grams, 1, 5000)),
      kcal_100g: r1(clamp(m.kcal_100g, 0, 950)),
      protein_100g: r1(clamp(m.protein_100g, 0, 100)),
      carbs_100g: r1(clamp(m.carbs_100g, 0, 100)),
      fat_100g: r1(clamp(m.fat_100g, 0, 100)),
      unit_name: m.unit_name && m.unit_g > 0 ? m.unit_name.trim().slice(0, 40) : '',
      unit_g: m.unit_name && m.unit_g > 0 ? r1(clamp(m.unit_g, 1, 2000)) : 0,
    }));
  const sessions = (d.sessions ?? [])
    .filter((s) => s.duration_min > 0)
    .map((s) => ({
      activity: (ACTIVITIES as readonly string[]).includes(s.activity) ? s.activity : 'other',
      whoop_activity: (s.whoop_activity ?? '').trim().slice(0, 80) || null,
      duration_min: Math.round(clamp(s.duration_min, 1, 1440)),
      intensity: (INTENSITIES as readonly string[]).includes(s.intensity) ? s.intensity : 'moderate',
    }));
  return {
    name,
    kcal: Math.round(clamp(d.kcal, 800, 8000)),
    protein_g: Math.round(clamp(d.protein_g, 0, 600)),
    carbs_g: Math.round(clamp(d.carbs_g, 0, 1200)),
    fat_g: Math.round(clamp(d.fat_g, 0, 400)),
    sessions,
    meals,
  };
}
