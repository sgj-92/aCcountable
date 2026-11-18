import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, RefreshControl, View } from 'react-native';

import {
  Button,
  Card,
  Chip,
  Divider,
  ErrorText,
  fmt,
  Loading,
  ProgressBar,
  Row,
  Screen,
  Stepper,
  T,
} from '@/components/ui';
import { WeightChart } from '@/components/weight-chart';
import { Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { useTheme } from '@/hooks/use-theme';
import { computeWeek, loadWeek } from '@/lib/adaptive';
import { copyPreviousWeek, isProfileComplete } from '@/lib/api';
import { addDays, dayName, formatWeekRange, parseISODate, startOfWeek, today, weekDates } from '@/lib/dates';
import { ACTIVITY_LABELS } from '@/lib/nutrition';

export default function WeekScreen() {
  const c = useTheme();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today()));
  const [copying, setCopying] = useState(false);
  const days = weekDates(weekStart);

  const { data, error, reload, refreshing, refresh } = useAsync(() => loadWeek(weekStart), weekStart);

  const stepper = (
    <Stepper
      label={formatWeekRange(weekStart)}
      onPrev={() => setWeekStart(addDays(weekStart, -7))}
      onNext={() => setWeekStart(addDays(weekStart, 7))}
    />
  );

  if (!data) {
    return (
      <Screen>
        {stepper}
        {error ? <ErrorText message={error} /> : <Loading />}
      </Screen>
    );
  }

  const { profile, sessions } = data;
  const todayStr = today();
  const view = computeWeek(data, todayStr);
  const rows = days.map((d) => ({ date: d, sessions: sessions.filter((s) => s.date === d), day: view?.days[d] }));

  const week = view?.week;
  const weekEaten = rows.reduce((s, r) => s + (r.day?.eaten ?? 0), 0);
  const weekTraining = rows.reduce((s, r) => s + (r.day?.raw.training ?? 0), 0);
  const projectedDiff = week ? week.projected - week.budget : 0;

  async function copyLastWeek() {
    setCopying(true);
    try {
      const n = await copyPreviousWeek(weekStart);
      if (n === 0) Alert.alert('Nothing to copy', 'Last week has no training sessions.');
      await reload();
    } catch (e) {
      Alert.alert('Could not copy', e instanceof Error ? e.message : String(e));
    } finally {
      setCopying(false);
    }
  }

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      {stepper}
      <ErrorText message={error} />

      {!isProfileComplete(profile) ? (
        <Card>
          <T variant="heading">Set up your profile</T>
          <T variant="muted">Targets appear once your profile is complete.</T>
          <Button title="Go to profile" onPress={() => router.navigate('/profile')} />
        </Card>
      ) : week ? (
        <Card style={{ gap: Spacing.md }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View>
              <T variant="small">Week budget</T>
              <T variant="heading">{fmt(week.budget)} kcal</T>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <T variant="small">Eaten so far</T>
              <T variant="heading">{fmt(weekEaten)} kcal</T>
            </View>
          </Row>
          <ProgressBar value={weekEaten} max={week.budget} />
          <T variant="small" color={c.training}>
            Training adds {fmt(weekTraining)} kcal this week
          </T>
          <T variant="muted" color={Math.abs(projectedDiff) <= 150 ? c.success : projectedDiff > 0 ? c.danger : c.fat}>
            {Math.abs(projectedDiff) <= 150
              ? week.carried !== 0
                ? `On course: ${week.carried > 0 ? 'overs' : 'unders'} so far are balanced across the remaining days.`
                : 'On course for the week.'
              : projectedDiff > 0
                ? `On course to finish ${fmt(projectedDiff)} kcal over. The remaining days are already at their limit.`
                : `On course to finish ${fmt(-projectedDiff)} kcal under.`}
          </T>
        </Card>
      ) : null}

      <Card style={{ gap: 0, paddingVertical: Spacing.sm }}>
        {rows.map((r, i) => {
          const isToday = r.date === todayStr;
          return (
            <View key={r.date}>
              {i > 0 ? <Divider /> : null}
              <View style={{ paddingVertical: Spacing.md, gap: Spacing.sm }}>
                <Pressable onPress={() => router.navigate({ pathname: '/', params: { date: r.date } })}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Row gap={Spacing.sm}>
                      <T variant="heading" color={isToday ? c.primary : c.text}>
                        {dayName(r.date)} {parseISODate(r.date).getDate()}
                      </T>
                      {isToday ? <T variant="small" color={c.primary}>today</T> : null}
                    </Row>
                    {r.day ? (
                      <Row gap={Spacing.sm}>
                        {r.day.adjustment !== 0 ? (
                          <T variant="small" color={r.day.adjustment < 0 ? c.fat : c.success}>
                            {r.day.adjustment > 0 ? '+' : '−'}
                            {fmt(Math.abs(r.day.adjustment))}
                          </T>
                        ) : null}
                        <T variant="muted">
                          {r.day.eaten > 0 ? `${fmt(r.day.eaten)} / ` : ''}
                          {fmt(r.day.adjusted)} kcal
                        </T>
                      </Row>
                    ) : null}
                  </Row>
                </Pressable>
                {r.day?.status === 'untracked' ? <T variant="small">Nothing logged: not counted in the balance</T> : null}
                {r.day && r.day.eaten > 0 ? <ProgressBar value={r.day.eaten} max={r.day.adjusted} height={5} /> : null}
                <Row style={{ flexWrap: 'wrap' }} gap={Spacing.xs}>
                  {r.sessions.map((s) => (
                    <Chip
                      key={s.id}
                      active
                      color={c.training}
                      label={`${s.actual_kcal != null ? '✓ ' : ''}${ACTIVITY_LABELS[s.activity]} ${s.actual_duration_min ?? s.duration_min}′`}
                      onPress={() => router.push({ pathname: '/training', params: { id: s.id, date: r.date } })}
                    />
                  ))}
                  <Chip label="+ Session" onPress={() => router.push({ pathname: '/training', params: { date: r.date } })} />
                </Row>
              </View>
            </View>
          );
        })}
      </Card>

      <Button title="Copy last week’s training" variant="secondary" onPress={copyLastWeek} loading={copying} />

      {view && view.trend.length > 0 ? (
        <Pressable onPress={() => router.push('/weigh-in')} accessibilityRole="button">
          <Card style={{ gap: Spacing.sm }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T variant="heading">Weight trend</T>
              <T variant="muted">
                {view.trend.at(-1)!.trend.toFixed(1)} kg
                {view.rate != null ? ` · ${view.rate < 0 ? '−' : '+'}${Math.abs(view.rate).toFixed(2)}/wk` : ''}
              </T>
            </Row>
            <WeightChart points={view.trend} height={110} />
          </Card>
        </Pressable>
      ) : null}
    </Screen>
  );
}
