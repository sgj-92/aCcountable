import type { FoodEntry } from './api';
import type { MealTime } from './meal-times';
import { eatenMinutes } from './meals';
import type { PlanItem } from './plans';

export const nowMinutes = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

/**
 * "Just times" meals: food grouped by the hour it was eaten, planned meals at their suggested
 * time (joining food eaten in that hour), and on today an open group for now to add to.
 */
export function timeGroups(
  food: FoodEntry[],
  openPlan: PlanItem[],
  times: Record<string, MealTime> | null,
  isToday: boolean,
  now: number = nowMinutes(),
): { key: string; minutes: number | null; items: FoodEntry[]; planned: PlanItem[]; suggested?: MealTime }[] {
  const groups = new Map<string, { key: string; minutes: number | null; items: FoodEntry[]; planned: PlanItem[]; suggested?: MealTime }>();
  const hourKey = (m: number | null) => (m == null ? 'unknown' : `h${Math.floor(m / 60)}`);
  const groupFor = (key: string, minutes: number | null) => {
    let g = groups.get(key);
    if (!g) {
      g = { key, minutes, items: [], planned: [] };
      groups.set(key, g);
    }
    return g;
  };
  for (const f of food) {
    const m = eatenMinutes(f);
    const g = groupFor(hourKey(m), m);
    g.items.push(f);
    if (m != null && (g.minutes == null || m < g.minutes)) g.minutes = m;
  }
  for (const item of openPlan) {
    const t = times?.[item.meal];
    const g = t ? groupFor(hourKey(t.minutes), t.minutes) : groupFor(`plan-${item.meal}`, null);
    g.planned.push(item);
    if (t) g.suggested = t;
  }
  if (isToday) {
    if (!groups.has(hourKey(now))) groupFor(hourKey(now), now);
  }
  return [...groups.values()].sort((a, b) => (a.minutes ?? 9999) - (b.minutes ?? 9999));
}
