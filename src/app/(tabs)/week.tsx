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
import { Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { useTheme } from '@/hooks/use-theme';
import { copyPreviousWeek, getProfile, isProfileComplete, listFood, listSessions } from '@/lib/api';
import { addDays, dayName, formatWeekRange, parseISODate, startOfWeek, today, weekDates } from '@/lib/dates';
import { ACTIVITY_LABELS, sumTotals } from '@/lib/nutrition';
import { targetFor } from '@/lib/targets';

export default function WeekScreen() {
  const c = useTheme();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today()));
  const [copying, setCopying] = useState(false);
  const days = weekDates(weekStart);
  const weekEnd = days[6];

  const { data, error, loading, reload } = useAsync(async () => {
    const [profile, sessions, food] = await Promise.all([
      getProfile(),
      listSessions(weekStart, weekEnd),
      listFood(weekStart, weekEnd),
    ]);
    return { profile, sessions, food };
  }, weekStart);

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

  const { profile, sessions, food } = data;
  const todayStr = today();
  const rows = days.map((d) => {
    const daySessions = sessions.filter((s) => s.date === d);
    const target = targetFor(profile, d, sessions);
    const eaten = sumTotals(food.filter((f) => f.date === d)).kcal;
    return { date: d, sessions: daySessions, target, eaten };
  });

  const weekTarget = rows.reduce((s, r) => s + (r.target?.kcal ?? 0), 0);
  const weekEaten = rows.reduce((s, r) => s + r.eaten, 0);
  const weekTraining = rows.reduce((s, r) => s + (r.target?.training ?? 0), 0);
  // Balance only over days that are finished (before today) and have something logged.
  const closedDays = rows.filter((r) => r.date < todayStr && r.eaten > 0 && r.target);
  const balance = closedDays.reduce((s, r) => s + (r.eaten - (r.target?.kcal ?? 0)), 0);

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
    <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}>
      {stepper}
      <ErrorText message={error} />

      {!isProfileComplete(profile) ? (
        <Card>
          <T variant="heading">Set up your profile</T>
          <T variant="muted">Targets appear once your profile is complete.</T>
          <Button title="Go to profile" onPress={() => router.navigate('/profile')} />
        </Card>
      ) : (
        <Card style={{ gap: Spacing.md }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View>
              <T variant="small">Week target</T>
              <T variant="heading">{fmt(weekTarget)} kcal</T>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <T variant="small">Eaten</T>
              <T variant="heading">{fmt(weekEaten)} kcal</T>
            </View>
          </Row>
          <ProgressBar value={weekEaten} max={weekTarget} />
          <Row style={{ justifyContent: 'space-between' }}>
            <T variant="small" color={c.training}>
              Training adds {fmt(weekTraining)} kcal this week
            </T>
            {closedDays.length > 0 ? (
              <T variant="small" color={balance > 0 ? c.danger : c.success}>
                {balance > 0 ? '+' : '−'}
                {fmt(Math.abs(balance))} vs plan
              </T>
            ) : null}
          </Row>
        </Card>
      )}

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
                    {r.target ? (
                      <T variant="muted">
                        {r.eaten > 0 ? `${fmt(r.eaten)} / ` : ''}
                        {fmt(r.target.kcal)} kcal
                      </T>
                    ) : null}
                  </Row>
                </Pressable>
                {r.target && r.eaten > 0 ? <ProgressBar value={r.eaten} max={r.target.kcal} height={5} /> : null}
                <Row style={{ flexWrap: 'wrap' }} gap={Spacing.xs}>
                  {r.sessions.map((s) => (
                    <Chip
                      key={s.id}
                      active
                      color={c.training}
                      label={`${ACTIVITY_LABELS[s.activity]} ${s.duration_min}′`}
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
    </Screen>
  );
}
