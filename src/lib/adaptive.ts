/**
 * Everything the Today, Plan and Week screens need to agree on: each day's
 * target after weekly balancing (with macros to match), the weight trend, and
 * the "on track?" insights. One loader, one pure computation.
 */
import {
  getProfile,
  listDiaryDays,
  listFood,
  listSessions,
  listWeighIns,
  listWhoopWorkouts,
  type FoodEntry,
  type Profile,
  type TrainingSession,
  type WeighInRow,
} from './api';
import { addDays, startOfWeek, today as todayISO, weekDates } from './dates';
import { estimateExpenditure, suggestedAdjustment, type ExpenditureEstimate, type NotEnoughData } from './expenditure';
import { buildInsights, type Insight } from './insights';
import { baseTarget, macroTargets, sumTotals, type DayTarget } from './nutrition';
import { sessionKcalDetail, sessionLabel, settingsFor, statsFor, targetFor, type Rates } from './targets';
import { balanceWeek, type WeekBalance, type WeekDay } from './weekly';
import { judgePace, weeklyRate, weightTrend, type PaceVerdict, type TrendPoint } from './weight';
import { ratesForModel, ratesFromRows, type ActivityRate } from './whoop';

export interface WeekData {
  profile: Profile;
  weekStart: string;
  /** This week plus the 4 weeks before today (for the burn estimate). */
  sessions: TrainingSession[];
  food: FoodEntry[];
  /** Dates marked diary only, over the same range. */
  diaryDays: string[];
  weighIns: WeighInRow[];
  whoopRates: ActivityRate[];
  /** Per exact WHOOP activity name, most-logged first. */
  whoopNamed: ActivityRate[];
}

/** Loads the week containing `date`, plus recent weigh-ins and WHOOP history. */
export async function loadWeek(date: string): Promise<WeekData> {
  const weekStart = startOfWeek(date);
  const weekEnd = addDays(weekStart, 6);
  const windowStart = addDays(todayISO(), -EXPENDITURE_WINDOW);
  const from = windowStart < weekStart ? windowStart : weekStart;
  const [profile, sessions, food, weighIns, whoop, diaryDays] = await Promise.all([
    getProfile(),
    listSessions(from, weekEnd),
    listFood(from, weekEnd),
    listWeighIns(addDays(date < todayISO() ? date : todayISO(), -90)).catch(() => [] as WeighInRow[]),
    listWhoopWorkouts().catch(() => []),
    listDiaryDays(from, weekEnd),
  ]);
  const rates = ratesFromRows(whoop);
  return { profile, weekStart, sessions, food, diaryDays, weighIns, whoopRates: rates.byActivity, whoopNamed: rates.byName };
}

export interface AdjustedDay extends WeekDay {
  /** Target before balancing (base + training), with its breakdown. */
  raw: DayTarget;
  /** Macro targets that go with the balanced calories. */
  proteinG: number;
  carbsG: number;
  fatG: number;
}

const EXPENDITURE_WINDOW = 28;

export interface BurnView {
  estimate: ExpenditureEstimate | NotEnoughData;
  /** New maintenance correction to offer, or null if none is needed. */
  suggestion: number | null;
}

export interface WeekView {
  /** Weight-trend burn estimate over the last 4 weeks. */
  burn: BurnView;
  /** Dates in this week marked diary only. */
  diary: Set<string>;
  rates: Rates;
  week: WeekBalance;
  days: Record<string, AdjustedDay>;
  trend: TrendPoint[];
  rate: number | null;
  pace: PaceVerdict;
  insights: Insight[];
}

/** Returns null until the profile has what targets need. */
export function computeWeek(data: WeekData, today: string): WeekView | null {
  const { profile, sessions, food, weekStart } = data;
  const stats = statsFor(profile, today);
  if (!stats) return null;
  const settings = settingsFor(profile);
  const rates = ratesForModel(data.whoopRates, data.whoopNamed);

  const diary = new Set(data.diaryDays ?? []);
  const dates = weekDates(weekStart);
  const raws = dates.map((d) => targetFor(profile, d, sessions, rates)!);
  const balance = balanceWeek(
    dates.map((date, i) => {
      const entries = food.filter((f) => f.date === date);
      // Diary-only days count as not tracked: left out of the balance.
      return { date, target: raws[i].kcal, eaten: sumTotals(entries).kcal, logged: entries.length > 0 && !diary.has(date) };
    }),
    today,
    { bmr: raws[0].bmr },
  );

  const days: Record<string, AdjustedDay> = {};
  balance.days.forEach((d, i) => {
    const raw = raws[i];
    const m = macroTargets(d.adjusted, raw.base, stats.weightKg, settings);
    days[d.date] = {
      ...d,
      raw,
      proteinG: Math.round(m.proteinG),
      carbsG: Math.round(m.carbsG),
      fatG: Math.round(m.fatG),
    };
  });

  const trend = weightTrend(data.weighIns);
  const rate = weeklyRate(trend);
  const pace = judgePace(rate, profile.goal, profile.goal_rate_kg_per_week);

  const todayDay = days[today];
  // Burn estimate from the last 4 weeks (up to yesterday).
  const end = addDays(today, -1);
  const burnDays = Array.from({ length: EXPENDITURE_WINDOW }, (_, i) => addDays(end, -(EXPENDITURE_WINDOW - 1) + i)).map((date) => {
    const entries = food.filter((f) => f.date === date);
    const dayStats = statsFor(profile, date) ?? stats;
    const training = sessions
      .filter((s) => s.date === date)
      .reduce((sum, s) => sum + (sessionKcalDetail(profile, s, rates)?.net ?? 0), 0);
    return {
      date,
      eaten: sumTotals(entries).kcal,
      tracked: entries.length > 0 && !diary.has(date),
      model: baseTarget(dayStats, settings).maintenance + training,
    };
  });
  const estimate = estimateExpenditure(burnDays, trend, end, EXPENDITURE_WINDOW);
  const burn: BurnView = {
    estimate,
    suggestion: estimate.burn === null ? null : suggestedAdjustment(estimate, profile.maintenance_adjust_kcal ?? 0),
  };

  const unconfirmed = sessions
    .filter((s) => s.date >= weekStart && s.date < today && s.actual_kcal == null)
    .map((s) => ({ id: s.id, date: s.date, label: sessionLabel(s) }));
  const insights = todayDay
    ? buildInsights({
        today,
        todayTarget: todayDay.adjusted,
        eatenToday: todayDay.eaten,
        week: balance,
        goal: profile.goal,
        goalRate: profile.goal_rate_kg_per_week,
        pace,
        rate,
        lastWeighIn: data.weighIns.length ? data.weighIns[data.weighIns.length - 1].date : null,
        unconfirmed,
        hasWhoopHistory: data.whoopRates.length > 0,
        hasSessions: sessions.length > 0,
        diaryToday: diary.has(today),
        burn: burn.suggestion != null && estimate.burn !== null ? { burn: estimate.burn, difference: estimate.difference } : null,
      })
    : [];

  return { burn, diary, rates, week: balance, days, trend, rate, pace, insights };
}
