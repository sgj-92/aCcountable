import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, RefreshControl, Text, View } from 'react-native';

import { WeekStrip } from '@/components/hero';
import { Icon } from '@/components/icon';
import { Overline } from '@/components/sheet';
import { TabHeader } from '@/components/tab-header';
import { Button, Card, ErrorText, fmt, Loading, Num, ProgressBar, Row, Screen, T } from '@/components/ui';
import { WeightChart } from '@/components/weight-chart';
import { Radius, Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { useTheme } from '@/hooks/use-theme';
import { computeWeek, loadWeek } from '@/lib/adaptive';
import { copyPreviousWeek, isProfileComplete } from '@/lib/api';
import { addDays, dayName, formatWeekRange, parseISODate, startOfWeek, today, weekDates } from '@/lib/dates';
import { sessionLabel } from '@/lib/targets';

export default function WeekScreen() {
  const c = useTheme();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today()));
  const [copying, setCopying] = useState(false);
  const days = weekDates(weekStart);

  const { data, error, reload, refreshing, refresh } = useAsync(() => loadWeek(weekStart), weekStart);

  const isThisWeek = weekStart === startOfWeek(today());
  const stepper = (
    <TabHeader
      sub={formatWeekRange(weekStart)}
      title={isThisWeek ? 'This week' : 'Week'}
      unit="week"
      onPrev={() => setWeekStart(addDays(weekStart, -7))}
      onNext={() => setWeekStart(addDays(weekStart, 7))}
      back={isThisWeek ? null : { label: 'Back to this week', onPress: () => setWeekStart(startOfWeek(today())) }}
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

  const projection =
    !week
      ? null
      : Math.abs(projectedDiff) <= 150
        ? {
            level: 'good' as const,
            text:
              week.carried !== 0
                ? `On course: ${week.carried > 0 ? 'overs' : 'unders'} so far are balanced across the remaining days.`
                : 'On course for the week.',
          }
        : projectedDiff > 0
          ? { level: 'warn' as const, text: `On course to finish ${fmt(projectedDiff)} kcal over. The remaining days are already at their limit.` }
          : { level: 'info' as const, text: `On course to finish ${fmt(-projectedDiff)} kcal under.` };

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      {stepper}
      <ErrorText message={error} />

      {!isProfileComplete(profile) ? (
        <Card hero>
          <T variant="headline">Set up your profile</T>
          <T variant="footnote">Targets appear once your profile is complete.</T>
          <Button title="Go to profile" onPress={() => router.navigate('/profile')} />
        </Card>
      ) : week ? (
        <Card hero style={{ gap: Spacing.md }}>
          <Row gap={Spacing.md} style={{ alignItems: 'flex-start' }}>
            <Stat value={fmt(week.budget)} label="Week budget" />
            <Stat value={fmt(weekEaten)} label="Eaten so far" />
            <Stat value={`+${fmt(weekTraining)}`} label="Training adds" color={c.training} />
          </Row>
          <WeekStrip days={week.days} viewedDate={todayStr} interactive={false} />
          {projection ? (
            <Row
              gap={Spacing.sm}
              style={{
                backgroundColor: { good: c.goodBg, warn: c.warnBg, info: c.infoBg }[projection.level],
                borderRadius: Radius.md,
                paddingVertical: 10,
                paddingHorizontal: 12,
                alignItems: 'flex-start',
              }}>
              <Icon name={projection.level} size={18} color={{ good: c.good, warn: c.warn, info: c.info }[projection.level]} />
              <T variant="footnote" color={c.text} style={{ flex: 1 }}>
                {projection.text}
              </T>
            </Row>
          ) : null}
        </Card>
      ) : null}

      <View style={{ gap: 4 }}>
        {rows.map((r) => {
          const isToday = r.date === todayStr;
          const d = r.day;
          const untracked = d?.status === 'untracked';
          const future = d?.status === 'future';
          const diff = d ? d.eaten - d.adjusted : 0;
          return (
            <Pressable
              key={r.date}
              accessibilityRole="button"
              accessibilityLabel={`${dayName(r.date)} ${parseISODate(r.date).getDate()}${d ? `, ${fmt(d.eaten)} of ${fmt(d.adjusted)} kcal` : ''}. Opens the day`}
              onPress={() => router.navigate({ pathname: '/', params: { date: r.date } })}
              style={({ pressed }) => ({
                minHeight: 76,
                paddingVertical: 12,
                paddingHorizontal: 10,
                borderRadius: 18,
                gap: Spacing.sm,
                backgroundColor: isToday ? c.raised : pressed ? c.surface : 'transparent',
              })}>
              <Row gap={Spacing.md}>
                <View style={{ width: 40 }}>
                  <T style={{ fontWeight: '700' }} color={isToday ? c.accentText : c.text}>
                    {dayName(r.date)}
                  </T>
                  <T variant="caption" style={{ fontWeight: '400' }}>
                    {parseISODate(r.date).getDate()}
                  </T>
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <Row gap={Spacing.sm}>
                    {d ? (
                      <Text maxFontSizeMultiplier={1.3} style={{ flexShrink: 1 }}>
                        <Num size="xs" color={untracked ? c.text3 : c.text}>
                          {d.eaten > 0 ? fmt(d.eaten) : '–'}
                        </Num>
                        <Text style={{ fontSize: 13, color: c.text2 }}> / {fmt(d.adjusted)}</Text>
                      </Text>
                    ) : null}
                    {d && d.adjustment !== 0 ? (
                      <View style={{ height: 22, paddingHorizontal: 8, borderRadius: 11, backgroundColor: isToday ? c.surface : c.raised, justifyContent: 'center' }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: c.text2, fontVariant: ['tabular-nums'] }}>
                          {d.adjustment > 0 ? '+' : '−'}
                          {fmt(Math.abs(d.adjustment))}
                        </Text>
                      </View>
                    ) : null}
                    <View style={{ flex: 1 }} />
                    {d && !future && !untracked && d.eaten > 0 ? (
                      <Text
                        style={{
                          fontFamily: 'Archivo_700Bold',
                          fontSize: 13,
                          color: isToday ? c.text2 : diff > 0 ? c.alert : c.good,
                          fontVariant: ['tabular-nums'],
                        }}>
                        {isToday ? `${fmt(Math.max(0, -diff))} left` : diff > 0 ? `+${fmt(diff)}` : `−${fmt(-diff)}`}
                      </Text>
                    ) : null}
                  </Row>
                  {untracked ? (
                    <T variant="footnote" color={c.text3}>
                      Nothing logged: not counted
                    </T>
                  ) : future || !d || d.eaten === 0 ? (
                    <View style={{ height: 4, borderRadius: 2, borderWidth: 1, borderStyle: 'dashed', borderColor: c.text3 }} />
                  ) : (
                    <ProgressBar value={d.eaten} max={d.adjusted} height={4} />
                  )}
                  <Row style={{ flexWrap: 'wrap' }} gap={6}>
                    {r.sessions.map((s) => {
                      const done = s.actual_kcal != null;
                      const canConfirm = s.date <= todayStr;
                      return (
                        <SmallChip
                          key={s.id}
                          label={`${done ? '✓ ' : ''}${sessionLabel(s)} ${s.actual_duration_min ?? s.duration_min}′${!done && canConfirm ? ' · confirm' : ''}`}
                          tone={done ? 'done' : canConfirm ? 'estimate' : 'planned'}
                          onPress={() => router.push({ pathname: '/training', params: { id: s.id, date: r.date } })}
                        />
                      );
                    })}
                    <SmallChip label="+ Session" tone="add" onPress={() => router.push({ pathname: '/training', params: { date: r.date } })} />
                  </Row>
                </View>
              </Row>
            </Pressable>
          );
        })}
      </View>

      <Button title="Copy last week’s training" variant="secondary" onPress={copyLastWeek} loading={copying} />

      {view && view.trend.length > 0 ? (
        <Pressable onPress={() => router.push('/weigh-in')} accessibilityRole="button">
          <Card hero style={{ gap: Spacing.sm }}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <View>
                <Overline>Weight trend</Overline>
                <Num size="m" style={{ paddingHorizontal: 4 }}>
                  {view.trend.at(-1)!.trend.toFixed(1)} kg
                </Num>
              </View>
              {view.rate != null ? (
                <Num size="xs" color={view.pace === 'on-track' ? c.good : view.pace === 'wrong-direction' ? c.alert : c.warn}>
                  {view.rate < 0 ? '−' : '+'}
                  {Math.abs(view.rate).toFixed(2)} kg/wk
                </Num>
              ) : null}
            </Row>
            <WeightChart
              points={view.trend}
              height={166}
              goalRatePerWeek={
                profile.goal === 'lose' ? -Math.abs(profile.goal_rate_kg_per_week) : profile.goal === 'gain' ? Math.abs(profile.goal_rate_kg_per_week) : undefined
              }
            />
          </Card>
        </Pressable>
      ) : null}
    </Screen>
  );
}

function Stat({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Num size="m" color={color} numberOfLines={1}>
        {value}
      </Num>
      <T variant="caption" style={{ fontWeight: '400' }}>
        {label}
      </T>
    </View>
  );
}

/** 26 pt session chip: done ✓ (training tint), estimate to confirm, planned (dashed) or + Session. */
function SmallChip({ label, tone, onPress }: { label: string; tone: 'done' | 'estimate' | 'planned' | 'add'; onPress: () => void }) {
  const c = useTheme();
  const dashed = tone === 'planned' || tone === 'add';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={9}
      style={({ pressed }) => ({
        height: 26,
        paddingHorizontal: 10,
        borderRadius: 13,
        justifyContent: 'center',
        backgroundColor: tone === 'done' || tone === 'estimate' ? c.trainingBg : 'transparent',
        borderWidth: dashed ? 1 : 0,
        borderStyle: 'dashed',
        borderColor: tone === 'add' ? c.text3 : c.training,
        opacity: pressed ? 0.7 : 1,
      })}>
      <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 12, fontWeight: '600', color: tone === 'add' ? c.text2 : c.training }}>
        {label}
      </Text>
    </Pressable>
  );
}
