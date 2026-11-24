/**
 * Training fuel across the week: fuelled for the work, still losing at the goal rate.
 *
 * Each day's target is its rest-day base plus fuel for that day's training (the
 * session's burn after the eat-back setting). On top of that:
 *
 * - Recovery: after a big session (fuel of 400 kcal or more), a quarter of its fuel
 *   moves to the next day, when the body is refilling glycogen.
 * - Carb ceiling: a day's carbs are capped by how much training it holds, at
 *   3 g/kg on a rest day plus 1.25 g/kg per hour of training, up to 7 g/kg
 *   (sports-nutrition ranges, at the lean end for a fat-loss phase).
 *   Fuel moved in for recovery sits on top of the ceiling.
 * - What a ceiling holds back isn't dropped: it's shared evenly across the following
 *   days of the week (as far as their own ceilings allow), so the week's total, and
 *   with it the deficit, stays the same.
 *
 * Days that follow an agreed day type keep their agreed numbers and take no part.
 * Everything only ever moves forward in time, so a finished day's target never
 * changes because of a later day.
 */

export interface FuelDayInput {
  date: string;
  /** Rest-day calories (maintenance minus the goal deficit). */
  base: number;
  /** Training fuel for this day, after the eat-back setting. */
  training: number;
  /** Minutes of training on this day. */
  trainingMin: number;
  /** The day's protein and fat targets in grams (carbs fill the rest). */
  proteinG: number;
  fatG: number;
  /** Follows a day type: keeps its agreed numbers. */
  fixed?: boolean;
}

export interface FuelDay {
  date: string;
  /** Fuel on this day after the moves below (what's added to the base). */
  fuel: number;
  /** Moved in from yesterday's session. */
  recovery: number;
  /** Moved to the next day for recovery (≤ 0). */
  toTomorrow: number;
  /** Held back by the carb ceiling and shared with later days (≤ 0). */
  overCeiling: number;
  /** Received from earlier days' ceilings. */
  shared: number;
  /** The carb ceiling used, g/kg. */
  ceilingGPerKg: number;
}

export const RECOVERY_SHARE = 0.25;
export const RECOVERY_MIN_FUEL = 400;

/** Carbs ceiling for a day, in g per kg of body weight. */
export function carbCeilingGPerKg(trainingMin: number): number {
  return Math.min(7, 3 + 1.25 * (Math.max(0, trainingMin) / 60));
}

export function shapeFuel(days: FuelDayInput[], weightKg: number): FuelDay[] {
  const out: FuelDay[] = days.map((d) => ({
    date: d.date,
    fuel: d.training,
    recovery: 0,
    toTomorrow: 0,
    overCeiling: 0,
    shared: 0,
    ceilingGPerKg: carbCeilingGPerKg(d.trainingMin),
  }));

  // 1. Recovery: a quarter of a big session's fuel goes to the next (non-fixed) day.
  days.forEach((d, i) => {
    const next = days[i + 1];
    if (d.fixed || !next || next.fixed || d.training < RECOVERY_MIN_FUEL) return;
    const moved = Math.round(d.training * RECOVERY_SHARE);
    out[i].fuel -= moved;
    out[i].toTomorrow -= moved;
    out[i + 1].fuel += moved;
    out[i + 1].recovery += moved;
  });

  // Recovery fuel sits on top of the day's own ceiling (it's for yesterday's work).
  const ceilingKcal = (i: number) =>
    days[i].proteinG * 4 + days[i].fatG * 9 + weightKg * out[i].ceilingGPerKg * 4 + out[i].recovery;
  const headroom = (i: number) => Math.max(0, ceilingKcal(i) - (days[i].base + out[i].fuel));

  // 2. Ceiling, earliest day first: what's over goes to the following days.
  days.forEach((d, i) => {
    if (d.fixed) return;
    const over = d.base + out[i].fuel - Math.max(d.base, ceilingKcal(i));
    if (over <= 0) return;
    const later = days.map((_, j) => j).filter((j) => j > i && !days[j].fixed);
    if (later.length === 0) return; // nowhere to put it: keep it on the day
    out[i].fuel -= over;
    out[i].overCeiling -= over;
    let left = over;
    // Fill evenly, within the receiving days' own ceilings...
    for (let round = 0; round < 7 && left >= 1; round++) {
      const open = later.filter((j) => headroom(j) >= 1);
      if (open.length === 0) break;
      const share = left / open.length;
      for (const j of open) {
        const give = Math.min(share, headroom(j));
        out[j].fuel += give;
        out[j].shared += give;
        left -= give;
      }
    }
    // ...and if they're all full, evenly anyway, so the week's total holds.
    if (left >= 1) {
      for (const j of later) {
        out[j].fuel += left / later.length;
        out[j].shared += left / later.length;
      }
    }
  });

  return out.map((d) => ({
    ...d,
    fuel: Math.round(d.fuel),
    recovery: Math.round(d.recovery),
    toTomorrow: Math.round(d.toTomorrow),
    overCeiling: Math.round(d.overCeiling),
    shared: Math.round(d.shared),
  }));
}

/** Largest weekly step the weigh-in correction takes on its own (kcal/day). */
export const AUTO_STEP = 150;

/**
 * The weigh-in correction, applied by itself once a week: a step of at most
 * ±150 kcal/day towards the suggested correction. Null when it isn't due.
 */
export function autoCorrection(
  suggestion: number | null,
  current: number,
  lastApplied: string | null,
  today: string,
): number | null {
  if (suggestion == null || suggestion === current) return null;
  if (lastApplied) {
    const days = (Date.parse(today) - Date.parse(lastApplied)) / 86400000;
    if (days < 7) return null;
  }
  const step = Math.max(-AUTO_STEP, Math.min(AUTO_STEP, suggestion - current));
  return Math.round((current + step) / 10) * 10;
}
