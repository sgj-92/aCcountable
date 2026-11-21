/**
 * One line under the week strip on Today: how the week is going and what
 * balancing does to the days left. The design keeps the week projection here,
 * not in the "On track?" list.
 */
import { dayName } from './dates';
import type { WeekBalance } from './weekly';

export type SummaryTone = 'good' | 'info' | 'warn';

export interface WeekSummary {
  tone: SummaryTone;
  /** Coloured lead, e.g. "Week 481 over". */
  head: string;
  /** Quieter tail, e.g. "· Thu–Sun −160 a day". */
  tail: string;
}

const n = (v: number) => Math.round(Math.abs(v)).toLocaleString('en-GB');

/** Insight ids that the week strip replaces on Today. */
export const WEEK_INSIGHT_IDS = ['week-over', 'week-balancing', 'week-giveback'];

export function weekSummary(week: WeekBalance): WeekSummary {
  const adjusted = week.days.filter((d) => (d.status === 'today' || d.status === 'future') && d.adjustment !== 0);
  const range =
    adjusted.length === 0
      ? ''
      : adjusted.length === 1
        ? dayName(adjusted[0].date)
        : `${dayName(adjusted[0].date)}–${dayName(adjusted[adjusted.length - 1].date)}`;
  const avg = adjusted.length ? adjusted.reduce((s, d) => s + d.adjustment, 0) / adjusted.length : 0;
  const each = `${avg < 0 ? '−' : '+'}${n(avg)}`;
  const perDay = adjusted.length === 0 ? '' : adjusted.length === 1 ? `· ${range} ${each}` : `· ${range} ${each} a day`;

  if (week.unabsorbed > 150) {
    return {
      tone: 'warn',
      head: `Week ${n(week.unabsorbed)} over`,
      tail: adjusted.length ? `${perDay}, as far as is safe` : '· finishes over budget',
    };
  }
  if (week.unabsorbed < -800) {
    return { tone: 'warn', head: `Week ${n(week.unabsorbed)} under`, tail: '· eat enough to recover' };
  }
  if (week.carried > 50) {
    return { tone: 'info', head: `Week ${n(week.carried)} over so far`, tail: perDay || '· back on budget' };
  }
  if (week.carried < -50) {
    return { tone: 'good', head: `Week ${n(week.carried)} under so far`, tail: perDay || '· on budget' };
  }
  return { tone: 'good', head: 'Week on budget', tail: `· ${n(week.budget)} kcal` };
}
