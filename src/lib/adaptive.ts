/**
 * Everything the Today, Plan and Week screens need to agree on: each day's
 * target after weekly balancing (with macros to match), the weight trend, and
 * the "on track?" insights. One loader, one pure computation.
 */
import {
  getProfile,
  listFood,
  listSessions,
  listWeighIns,
  listWhoopWorkouts,
  type FoodEntry,
  type Profile,
  type TrainingSession,
  type WeighInRow,
} from './api';
import { addDays, startOfWeek, weekDates } from './dates';
import { buildInsights, type Insight } from './insights';
import { macroTargets, sumTotals, type DayTarget } from './nutrition';
import { sessionLabel, settingsFor, statsFor, targetFor, type Rates } from './targets';
import { balanceWeek, type WeekBalance, type WeekDay } from './weekly';
import { judgePace, weeklyRate, weightTrend, type PaceVerdict, type TrendPoint } from './weight';
import { ratesForModel, ratesFromRows, type ActivityRate } from './whoop';

export interface WeekData {
  profile: Profile;
  weekStart: string;
  sessions: TrainingSession[];
  food: FoodEntry[];
  weighIns: WeighInRow[];
  whoopRates: ActivityRate[];
  /** Per exact WHOOP activity name, most-logged first. */
  whoopNamed: ActivityRate[];
}

/** Loads the week containing `date`, plus recent weigh-ins and WHOOP history. */
export async function loadWeek(date: string): Promise<WeekData> {
  const weekStart = startOfWeek(date);
  const weekEnd = addDays(weekStart, 6);
  const [profile, sessions, food, weighIns, whoop] = await Promise.all([
    getProfile(),
    listSessions(weekStart, weekEnd),
    listFood(weekStart, weekEnd),
    listWeighIns(addDays(date, -90)).catch(() => [] as WeighInRow[]),
    listWhoopWorkouts().catch(() => []),
  ]);
  const rates = ratesFromRows(whoop);
  return { profile, weekStart, sessions, food, weighIns, whoopRates: rates.byActivity, whoopNamed: rates.byName };
}

export interface AdjustedDay extends WeekDay {
  /** Target before balancing (base + training), with its breakdown. */
  raw: DayTarget;
  /** Macro targets that go with the balanced calories. */
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface WeekView {
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

  const dates = weekDates(weekStart);
  const raws = dates.map((d) => targetFor(profile, d, sessions, rates)!);
  const balance = balanceWeek(
    dates.map((date, i) => {
      const entries = food.filter((f) => f.date === date);
      return { date, target: raws[i].kcal, eaten: sumTotals(entries).kcal, logged: entries.length > 0 };
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
  const unconfirmed = sessions
    .filter((s) => s.date < today && s.actual_kcal == null)
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
      })
    : [];

  return { rates, week: balance, days, trend, rate, pace, insights };
}
