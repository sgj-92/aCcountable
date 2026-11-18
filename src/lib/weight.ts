/**
 * Weigh-ins → a smoothed trend (so water and food weight don't mislead), the
 * weekly rate of change, and how that compares with the goal.
 */
import { parseISODate } from './dates';

export interface WeighIn {
  date: string;
  weight_kg: number;
}

export interface TrendPoint {
  date: string;
  weight: number;
  trend: number;
}

const DAY_MS = 86_400_000;
const daysBetween = (a: string, b: string) => Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / DAY_MS);

/**
 * Exponentially smoothed trend. `alpha` is the daily weight of a new reading;
 * gaps between weigh-ins count as several days of smoothing.
 */
export function weightTrend(weighIns: WeighIn[], alpha = 0.1): TrendPoint[] {
  const sorted = [...weighIns].sort((a, b) => a.date.localeCompare(b.date));
  const out: TrendPoint[] = [];
  for (const w of sorted) {
    const prev = out[out.length - 1];
    if (!prev) {
      out.push({ date: w.date, weight: w.weight_kg, trend: w.weight_kg });
      continue;
    }
    const gap = Math.max(1, daysBetween(prev.date, w.date));
    const a = 1 - Math.pow(1 - alpha, gap);
    out.push({ date: w.date, weight: w.weight_kg, trend: prev.trend + a * (w.weight_kg - prev.trend) });
  }
  return out;
}

/** kg per week from a least-squares line through the trend over the last `days` days. */
export function weeklyRate(points: TrendPoint[], days = 21): number | null {
  if (points.length < 2) return null;
  const last = points[points.length - 1].date;
  const recent = points.filter((p) => daysBetween(p.date, last) <= days);
  if (recent.length < 3 || daysBetween(recent[0].date, last) < 7) return null;
  const xs = recent.map((p) => daysBetween(recent[0].date, p.date));
  const ys = recent.map((p) => p.trend);
  const mx = xs.reduce((s, x) => s + x, 0) / xs.length;
  const my = ys.reduce((s, y) => s + y, 0) / ys.length;
  let num = 0;
  let den = 0;
  xs.forEach((x, i) => {
    num += (x - mx) * (ys[i] - my);
    den += (x - mx) ** 2;
  });
  return den === 0 ? null : (num / den) * 7;
}

export type PaceVerdict = 'not-enough-data' | 'on-track' | 'too-slow' | 'too-fast' | 'wrong-direction';

/**
 * Compares the measured weekly rate with the goal (negative = losing).
 * Tolerances are generous: weight trends are noisy over short periods.
 */
export function judgePace(rate: number | null, goal: 'lose' | 'maintain' | 'gain', goalRate: number): PaceVerdict {
  if (rate == null) return 'not-enough-data';
  if (goal === 'maintain') return Math.abs(rate) <= 0.25 ? 'on-track' : rate < 0 ? 'too-fast' : 'wrong-direction';
  const target = goal === 'lose' ? -Math.abs(goalRate) : Math.abs(goalRate);
  if (Math.sign(rate) !== Math.sign(target) && Math.abs(rate) > 0.1) return 'wrong-direction';
  const ratio = Math.abs(rate) / Math.abs(target);
  if (ratio < 0.5) return 'too-slow';
  if (ratio > 1.6) return 'too-fast';
  return 'on-track';
}
