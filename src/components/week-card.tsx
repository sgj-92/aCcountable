import { WeekStrip } from '@/components/hero';
import { InsightsCard } from '@/components/insights-card';
import { Overline } from '@/components/sheet';
import { Card, fmt, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import type { WeekView } from '@/lib/adaptive';
import type { Profile } from '@/lib/api';
import { addDays, formatDay, today } from '@/lib/dates';
import { WEEK_INSIGHT_IDS, weekSummary } from '@/lib/week-summary';

/** The week at a glance, for Plan: each day against its target, how the week's going, and the checks. */
export function WeekCard({ view, date, profile }: { view: WeekView; date: string; profile: Profile }) {
  const day = view.days[date];
  const adjustedOn = profile.maintenance_adjusted_on;
  const recentlyCorrected = !!adjustedOn && adjustedOn >= addDays(today(), -6) && profile.maintenance_adjust_kcal !== 0;
  const insights = view.insights.filter((i) => !WEEK_INSIGHT_IDS.includes(i.id));
  return (
    <>
      <Card hero style={{ gap: Spacing.md }}>
        <Overline>This week</Overline>
        <WeekStrip days={view.week.days} viewedDate={date} summary={weekSummary(view.week)} />
        {recentlyCorrected ? (
          <T variant="footnote">
            Adjusted from your weigh-ins on {formatDay(adjustedOn!)}: your base is now{' '}
            {profile.maintenance_adjust_kcal > 0 ? '+' : '−'}
            {fmt(Math.abs(profile.maintenance_adjust_kcal))} kcal/day against the formula, so your loss keeps to your
            goal. It checks again in a week.
          </T>
        ) : null}
        {day?.raw.flooredAtBmr ? (
          <T variant="footnote">
            Your goal deficit was capped so the base target doesn’t drop below your BMR ({fmt(day.raw.bmr)}).
          </T>
        ) : null}
      </Card>
      {date === today() ? <InsightsCard insights={insights} /> : null}
    </>
  );
}
