/**
 * Weekly balancing: each week (Mon–Sun) has a calorie budget, the sum of its
 * daily targets (base + that day's training). When a finished day goes over
 * or under, the difference is spread across the days left in the week so the
 * week still lands on budget, within limits:
 *   - remaining days drop by at most `maxCut` kcal/day, never below BMR;
 *   - under-eating is only given back up to `maxAdd` kcal/day, so it doesn't
 *     turn into overeating at the end of the week.
 * A day with nothing logged is treated as untracked, not as zero eaten.
 */

export interface WeekDayInput {
  date: string;
  /** That day's target before balancing (base + training). */
  target: number;
  eaten: number;
  /** Anything logged that day. */
  logged: boolean;
}

export interface WeekDay extends WeekDayInput {
  /** kcal added (+) or removed (−) by balancing. */
  adjustment: number;
  /** Target after balancing. */
  adjusted: number;
  status: 'past' | 'untracked' | 'today' | 'future';
  /** eaten − target for finished, tracked days. */
  difference: number | null;
}

export interface WeekBalance {
  days: WeekDay[];
  budget: number;
  /** Net over (+) / under (−) from finished days. */
  carried: number;
  /** Part of `carried` the remaining days couldn't absorb (week will miss budget by this). */
  unabsorbed: number;
  /** Eaten so far + adjusted targets for today and the rest of the week. */
  projected: number;
}

export interface BalanceOptions {
  bmr: number;
  maxCut?: number;
  maxAdd?: number;
}

export function balanceWeek(days: WeekDayInput[], today: string, opts: BalanceOptions): WeekBalance {
  const maxCut = opts.maxCut ?? 400;
  const maxAdd = opts.maxAdd ?? 200;
  const budget = days.reduce((s, d) => s + d.target, 0);

  let carried = 0;
  const out: WeekDay[] = days.map((d) => {
    const past = d.date < today;
    const status: WeekDay['status'] = past ? (d.logged ? 'past' : 'untracked') : d.date === today ? 'today' : 'future';
    const difference = status === 'past' ? d.eaten - d.target : null;
    if (difference != null) carried += difference;
    return { ...d, adjustment: 0, adjusted: d.target, status, difference };
  });

  // Spread the carry over today + future days, respecting caps and the BMR floor.
  const open = out.filter((d) => d.status === 'today' || d.status === 'future');
  let remaining = -carried; // kcal to add (+) or remove (−) across open days
  if (open.length > 0 && Math.abs(remaining) >= 1) {
    // Fill evenly, re-sharing what capped days couldn't take.
    let pool = [...open];
    for (let round = 0; round < 7 && pool.length > 0 && Math.abs(remaining) >= 1; round++) {
      const share = remaining / pool.length;
      const next: WeekDay[] = [];
      for (const d of pool) {
        const lo = Math.max(-maxCut, Math.min(0, opts.bmr - d.target)); // can't go below BMR
        const hi = maxAdd;
        const want = d.adjustment + share;
        const capped = Math.min(hi, Math.max(lo, want));
        remaining -= capped - d.adjustment;
        d.adjustment = capped;
        if (capped === want) next.push(d);
      }
      pool = next;
    }
  }
  // Measure what was absorbed before rounding, so rounding doesn't show up as "left over".
  const absorbed = open.reduce((s, d) => s + d.adjustment, 0);
  const unabsorbed = Math.round(carried + absorbed);
  for (const d of open) {
    d.adjustment = Math.round(d.adjustment);
    d.adjusted = Math.round(d.target + d.adjustment);
  }
  const projected = out.reduce((s, d) => {
    if (d.status === 'past') return s + d.eaten;
    if (d.status === 'untracked') return s + d.target; // assume on target
    return s + d.adjusted;
  }, 0);

  return { days: out, budget: Math.round(budget), carried: Math.round(carried), unabsorbed, projected: Math.round(projected) };
}
