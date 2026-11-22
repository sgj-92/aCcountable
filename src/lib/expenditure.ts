/**
 * What you actually burn, worked out from your own results (in the spirit of
 * MacroFactor's expenditure): average intake on fully tracked days, corrected
 * for how the weight trend moved over the same weeks.
 *
 *   burn ≈ average intake − (trend change in kg × 7,700) ÷ days
 *
 * Diary-only and unlogged days are left out of the intake average, so a
 * half-logged day can't make the burn look lower than it is. The weight
 * trend still covers every day, which is what lets weigh-ins carry the
 * estimate when logging is patchy.
 */
import { addDays, parseISODate } from './dates';
import { KCAL_PER_KG_BODY_WEIGHT } from './nutrition';
import type { TrendPoint } from './weight';

export interface ExpenditureDay {
  date: string;
  /** kcal logged that day. */
  eaten: number;
  /** Fully tracked: something logged and not marked diary only. */
  tracked: boolean;
  /** What the formula says that day burned: maintenance + training (before eat-back). */
  model: number;
}

export type Confidence = 'low' | 'medium' | 'high';

export interface ExpenditureEstimate {
  /** Estimated real daily burn, kcal. */
  burn: number;
  /** What the formula predicted for the same tracked days. */
  model: number;
  /** burn − model: positive means you burn more than the formula thinks. */
  difference: number;
  trackedDays: number;
  windowDays: number;
  weighIns: number;
  /** Trend change across the window, kg (negative = lost). */
  trendChangeKg: number;
  confidence: Confidence;
}

export interface NotEnoughData {
  burn: null;
  /** What's missing, in words. */
  reason: string;
  trackedDays: number;
  weighIns: number;
}

const DAY_MS = 86_400_000;
const span = (a: string, b: string) => Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / DAY_MS);

export const MIN_TRACKED_DAYS = 10;
export const MIN_WEIGH_INS = 4;
export const MIN_SPAN_DAYS = 14;

/** Trend value on `date`: the last point on or before it, or the first after it. */
function trendAt(trend: TrendPoint[], date: string): TrendPoint | undefined {
  let found: TrendPoint | undefined;
  for (const p of trend) {
    if (p.date <= date) found = p;
    else break;
  }
  return found ?? trend.find((p) => p.date > date);
}

/**
 * Estimates burn over the window ending on `end` (normally yesterday; today is
 * still in progress). `days` should cover the window, oldest first.
 */
export function estimateExpenditure(
  days: ExpenditureDay[],
  trend: TrendPoint[],
  end: string,
  windowDays = 28,
): ExpenditureEstimate | NotEnoughData {
  const start = addDays(end, -(windowDays - 1));
  const inWindow = days.filter((d) => d.date >= start && d.date <= end);
  const tracked = inWindow.filter((d) => d.tracked && d.eaten > 0);
  const readings = trend.filter((p) => p.date >= start && p.date <= end);

  const missing: string[] = [];
  if (tracked.length < MIN_TRACKED_DAYS) missing.push(`${MIN_TRACKED_DAYS - tracked.length} more fully tracked days`);
  if (readings.length < MIN_WEIGH_INS) missing.push(`${MIN_WEIGH_INS - readings.length} more weigh-ins`);
  const first = readings[0];
  const last = readings[readings.length - 1];
  const covered = first && last ? span(first.date, last.date) : 0;
  if (readings.length >= MIN_WEIGH_INS && covered < MIN_SPAN_DAYS)
    missing.push(`weigh-ins spread over at least ${MIN_SPAN_DAYS} days`);
  if (missing.length) {
    return { burn: null, reason: `Needs ${missing.join(' and ')}.`, trackedDays: tracked.length, weighIns: readings.length };
  }

  // Trend change measured between the first and last tracked days, so intake and weight cover the same stretch.
  const from = trendAt(trend, tracked[0].date)!;
  const to = trendAt(trend, tracked[tracked.length - 1].date)!;
  const days_ = Math.max(1, span(tracked[0].date, tracked[tracked.length - 1].date) + 1);
  const change = to.trend - from.trend;
  const avgIntake = tracked.reduce((s, d) => s + d.eaten, 0) / tracked.length;
  const burn = avgIntake - (change * KCAL_PER_KG_BODY_WEIGHT) / days_;
  const model = tracked.reduce((s, d) => s + d.model, 0) / tracked.length;

  const confidence: Confidence =
    tracked.length >= 21 && readings.length >= 12 ? 'high' : tracked.length >= 14 && readings.length >= 7 ? 'medium' : 'low';

  return {
    burn: Math.round(burn),
    model: Math.round(model),
    difference: Math.round(burn - model),
    trackedDays: tracked.length,
    windowDays,
    weighIns: readings.length,
    trendChangeKg: Math.round(change * 100) / 100,
    confidence,
  };
}

/**
 * The maintenance correction to suggest, or null when the formula is close
 * enough (within 100 kcal) or the estimate is too shaky to act on.
 * Changes are capped at ±300 kcal per step so one odd month can't swing targets.
 */
export function suggestedAdjustment(est: ExpenditureEstimate, currentAdjust: number): number | null {
  if (est.confidence === 'low') return null;
  if (Math.abs(est.difference) < 100) return null;
  const step = Math.max(-300, Math.min(300, est.difference));
  const next = Math.round((currentAdjust + step) / 10) * 10;
  return Math.max(-1500, Math.min(1500, next));
}
