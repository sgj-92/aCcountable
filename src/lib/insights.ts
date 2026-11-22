/**
 * "Are you on track?": short, actionable notes built from today's numbers,
 * the week's balance, the weight trend and unconfirmed training.
 */
import { dayName } from './dates';
import { KCAL_PER_KG_BODY_WEIGHT, type Goal } from './nutrition';
import type { WeekBalance } from './weekly';
import type { PaceVerdict } from './weight';

export type InsightLevel = 'good' | 'info' | 'warn' | 'alert';

export interface Insight {
  id: string;
  level: InsightLevel;
  title: string;
  detail?: string;
  /** Screen to open, with params. */
  action?: { label: string; pathname: string; params?: Record<string, string> };
}

export interface InsightInput {
  today: string;
  /** Today's target after weekly balancing, and what's been eaten. */
  todayTarget: number;
  eatenToday: number;
  week: WeekBalance;
  goal: Goal;
  goalRate: number;
  pace: PaceVerdict;
  /** kg per week (negative = losing), or null. */
  rate: number | null;
  /** Date of the most recent weigh-in, if any. */
  lastWeighIn: string | null;
  /** Past sessions with no confirmed burn. */
  unconfirmed: { id: string; date: string; label: string }[];
  hasWhoopHistory: boolean;
  hasSessions: boolean;
  /** Today is marked diary only: don't judge today's total. */
  diaryToday?: boolean;
  /** Weight-trend burn estimate that differs enough to suggest a target change. */
  burn?: { burn: number; difference: number } | null;
}

const kcal = (n: number) => `${Math.round(Math.abs(n)).toLocaleString()} kcal`;
const kg = (n: number) => `${Math.abs(n).toFixed(2)} kg`;

const ORDER: Record<InsightLevel, number> = { alert: 0, warn: 1, info: 2, good: 3 };

export function buildInsights(i: InsightInput): Insight[] {
  const out: Insight[] = [];
  const daysLeftAfterToday = i.week.days.filter((d) => d.status === 'future').length;

  // Today
  const overToday = i.eatenToday - i.todayTarget;
  if (!i.diaryToday && overToday > Math.max(100, i.todayTarget * 0.05)) {
    out.push({
      id: 'over-today',
      level: 'alert',
      title: `${kcal(overToday)} over today’s target`,
      detail:
        daysLeftAfterToday > 0
          ? `That’s fine if the day called for it: it’ll be spread over the ${daysLeftAfterToday} day${daysLeftAfterToday === 1 ? '' : 's'} left this week (about ${kcal(overToday / daysLeftAfterToday)} each). Did you train? Add the session so the target reflects it.`
          : 'It’s the last day of the week, so this lands on the weekly total. Did you train? Add the session so the target reflects it.',
      action: { label: 'Add a session', pathname: '/training', params: { date: i.today } },
    });
  }

  // Week
  const todayRow = i.week.days.find((d) => d.date === i.today);
  if (i.week.unabsorbed > 150) {
    out.push({
      id: 'week-over',
      level: 'warn',
      title: `On course to finish the week ${kcal(i.week.unabsorbed)} over`,
      detail:
        'The rest of the week is already reduced as far as it safely can be. An extra session, or a lighter day than planned, would close the gap.',
    });
  } else if (i.week.carried > 50 && todayRow && todayRow.adjustment < 0) {
    const overDays = i.week.days.filter((d) => (d.difference ?? 0) > 50).map((d) => dayName(d.date));
    out.push({
      id: 'week-balancing',
      level: 'info',
      title: `Today’s target is ${kcal(todayRow.adjustment)} lower to balance the week`,
      detail: `${overDays.length ? `Making up for ${overDays.join(', ')}. ` : ''}The week still finishes on budget.`,
    });
  } else if (i.week.carried < -50 && todayRow && todayRow.adjustment > 0) {
    out.push({
      id: 'week-giveback',
      level: 'info',
      title: `${kcal(todayRow.adjustment)} added to today`,
      detail: 'You’ve come in under earlier this week; a little is given back so recovery doesn’t suffer.',
    });
  }
  if (i.week.unabsorbed < -800) {
    out.push({
      id: 'week-under',
      level: 'warn',
      title: `Well under for the week (${kcal(i.week.unabsorbed)})`,
      detail: 'Big deficits make training and recovery harder and can stall progress. Make sure you’re eating enough.',
    });
  }

  // Weight
  if (!i.lastWeighIn) {
    out.push({
      id: 'weigh-first',
      level: 'info',
      title: 'Log your weight to check you’re really losing',
      detail: 'Weigh in a few mornings a week; the trend shows whether the plan is working.',
      action: { label: 'Log weight', pathname: '/weigh-in' },
    });
  } else {
    const daysSince = Math.round((Date.parse(i.today) - Date.parse(i.lastWeighIn)) / 86_400_000);
    if (daysSince >= 5) {
      out.push({
        id: 'weigh-again',
        level: 'info',
        title: `Last weigh-in was ${daysSince} days ago`,
        action: { label: 'Log weight', pathname: '/weigh-in' },
      });
    }
  }
  if (i.rate != null && i.goal !== 'maintain') {
    const target = i.goal === 'lose' ? -Math.abs(i.goalRate) : Math.abs(i.goalRate);
    const gapPerDay = Math.abs(((target - i.rate) * KCAL_PER_KG_BODY_WEIGHT) / 7);
    const losing = i.rate < 0 ? `Losing ${kg(i.rate)}/week` : `Gaining ${kg(i.rate)}/week`;
    if (i.pace === 'on-track') {
      out.push({ id: 'pace', level: 'good', title: `On pace: ${losing.toLowerCase()}`, detail: `Goal ${kg(target)}/week.` });
    } else if (i.pace === 'too-slow') {
      out.push({
        id: 'pace',
        level: 'warn',
        title: `${losing}, slower than your ${kg(target)} goal`,
        detail: `If it holds for another week or two, eating about ${kcal(gapPerDay)} less a day (or burning it) would close the gap. Check logging is complete first.`,
      });
    } else if (i.pace === 'wrong-direction') {
      out.push({
        id: 'pace',
        level: 'alert',
        title: `${losing}: heading the wrong way`,
        detail: `Your goal is ${i.goal === 'lose' ? 'to lose' : 'to gain'} ${kg(target)}/week. Check for unlogged food or drinks, and session burns that may be overestimated.`,
      });
    } else if (i.pace === 'too-fast') {
      out.push({
        id: 'pace',
        level: 'warn',
        title: `${losing}, faster than planned`,
        detail: `Fast losses can cost muscle and performance. You could eat about ${kcal(gapPerDay)} more a day.`,
      });
    }
  }

  // Weight-trend burn
  if (i.burn) {
    const more = i.burn.difference > 0;
    out.push({
      id: 'burn',
      level: 'info',
      title: `Your weigh-ins say you burn about ${kcal(i.burn.burn)} a day`,
      detail: `That’s ${kcal(i.burn.difference)} ${more ? 'more' : 'less'} than the formula assumes. You can update your base target to match.`,
      action: { label: 'Review', pathname: '/week' },
    });
  }

  // Training data
  for (const s of i.unconfirmed.slice(0, 3)) {
    out.push({
      id: `confirm-${s.id}`,
      level: 'info',
      title: `Confirm ${dayName(s.date)}’s ${s.label.toLowerCase()} burn`,
      detail: 'Enter the calories WHOOP recorded, or re-import your WHOOP export, so the week balances on real numbers.',
      action: { label: 'Confirm', pathname: '/training', params: { id: s.id } },
    });
  }
  if (i.hasSessions && !i.hasWhoopHistory) {
    out.push({
      id: 'whoop',
      level: 'info',
      title: 'Import your WHOOP history',
      detail: 'Session estimates will then use your own burn rates instead of generic ones.',
      action: { label: 'Import', pathname: '/whoop-import' },
    });
  }

  return out.sort((a, b) => ORDER[a.level] - ORDER[b.level]);
}
