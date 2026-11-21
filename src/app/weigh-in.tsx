import * as Haptics from 'expo-haptics';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Keyboard, Platform, Pressable, Text, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { LevelIcon } from '@/components/insights-card';
import { GramsField, Overline } from '@/components/sheet';
import { Button, Card, ErrorText, IconButton, Loading, Num, Row, Screen, T } from '@/components/ui';
import { WeightChart } from '@/components/weight-chart';
import { Radius, Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';
import { deleteWeighIn, getProfile, listWeighIns, saveWeighIn, updateProfile } from '@/lib/api';
import { addDays, formatDay, today } from '@/lib/dates';
import type { InsightLevel } from '@/lib/insights';
import { judgePace, weeklyRate, weightTrend } from '@/lib/weight';

const MIN_KG = 30;
const MAX_KG = 250;

export default function WeighInScreen() {
  const c = useTheme();
  const { reload: reloadSharedProfile } = useProfile();
  const [date, setDate] = useState(today());
  const [weight, setWeight] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<{ date: string; kg: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, reload } = useAsync(async () => {
    const [profile, weighIns] = await Promise.all([getProfile(), listWeighIns(addDays(today(), -90))]);
    return { profile, weighIns };
  }, 'weigh-ins');

  if (!data) {
    return (
      <Screen padTop={false}>
        <Loading />
      </Screen>
    );
  }

  const trend = weightTrend(data.weighIns);
  const rate = weeklyRate(trend);
  const pace = judgePace(rate, data.profile.goal, data.profile.goal_rate_kg_per_week);
  const kg = Number(weight.replace(',', '.'));
  const invalid = weight.trim() === '' || !Number.isFinite(kg) || kg < MIN_KG || kg > MAX_KG;
  const showError = weight.trim() !== '' && invalid;
  const lastReading = data.weighIns.at(-1);
  const existing = data.weighIns.find((w) => w.date === date);
  const goalRate =
    data.profile.goal === 'lose'
      ? -Math.abs(data.profile.goal_rate_kg_per_week)
      : data.profile.goal === 'gain'
        ? Math.abs(data.profile.goal_rate_kg_per_week)
        : 0;

  async function save() {
    if (invalid) return;
    setBusy(true);
    setError(null);
    try {
      const value = Math.round(kg * 100) / 100;
      await saveWeighIn(date, value);
      // Keep the profile weight (which drives targets) on the smoothed trend, not the day's reading.
      const all = await listWeighIns(addDays(today(), -90));
      const latest = weightTrend(all).at(-1);
      if (latest) await updateProfile(data!.profile.id, { weight_kg: Math.round(latest.trend * 10) / 10 });
      await reloadSharedProfile();
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Keyboard.dismiss();
      setSaved({ date, kg: value });
      setWeight('');
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function remove(id: string, label: string) {
    Alert.alert('Delete weigh-in?', label, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteWeighIn(id).catch((e) => setError(String(e)));
          reload();
        },
      },
    ]);
  }

  const level: InsightLevel =
    pace === 'on-track' ? 'good' : pace === 'too-slow' ? 'warn' : pace === 'too-fast' ? 'info' : pace === 'wrong-direction' ? 'alert' : 'info';
  const levelColor = { good: c.good, warn: c.warn, info: c.info, alert: c.alert }[level];
  const goalText = `${Math.abs(goalRate).toFixed(2)} kg/week`;
  const paceText =
    rate == null
      ? 'Log a few weigh-ins over a week or more to see your rate.'
      : pace === 'on-track'
        ? `On pace for your goal of ${goalText}.`
        : pace === 'too-slow'
          ? `Slower than your goal of ${goalText}. Give it another week before changing anything.`
          : pace === 'too-fast'
            ? `Faster than your goal of ${goalText}. You could eat a little more.`
            : pace === 'wrong-direction'
              ? `Heading the wrong way for your goal. Check for unlogged food and overestimated sessions.`
              : '';
  const recent = [...data.weighIns].reverse().slice(0, 14);
  const enough = data.weighIns.length >= 3;

  return (
    <Screen padTop={false}>
      <Stack.Screen
        options={{
          title: 'Weight',
          headerRight: saved
            ? () => (
                <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={10}>
                  <T color={c.accentText} style={{ fontWeight: '700' }}>
                    Done
                  </T>
                </Pressable>
              )
            : undefined,
        }}
      />
      <Row style={{ height: 44, borderRadius: 22, backgroundColor: c.raised, justifyContent: 'space-between' }}>
        <IconButton glyph="‹" label="Previous day" background="transparent" onPress={() => setDate(addDays(date, -1))} />
        <T variant="headline">{date === today() ? `Today · ${formatDay(date)}` : formatDay(date)}</T>
        <IconButton
          glyph="›"
          label="Next day"
          background="transparent"
          disabled={date >= today()}
          onPress={() => setDate(addDays(date, 1))}
        />
      </Row>

      {saved ? (
        <Animated.View
          entering={FadeInDown.duration(220)}
          accessibilityRole="summary"
          accessibilityLiveRegion="polite"
          style={{ minHeight: 44, borderRadius: Radius.md, backgroundColor: c.goodBg, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.lg }}>
          <Icon name="check" size={16} color={c.accentText} strokeWidth={2.6} />
          <T style={{ flex: 1, fontWeight: '600' }}>
            Logged <Text style={{ fontFamily: 'Archivo_700Bold' }}>{saved.kg.toFixed(1)} kg</Text>{' '}
            {saved.date === today() ? 'today' : `for ${formatDay(saved.date)}`}
          </T>
        </Animated.View>
      ) : null}

      <View style={{ gap: 6 }}>
        <T variant="footnote">{existing ? `Weight · replaces ${existing.weight_kg.toFixed(1)} kg` : 'Weight'}</T>
        <GramsField
          value={weight}
          onChangeText={setWeight}
          unit="kg"
          height={72}
          error={showError}
          autoFocus
          placeholder={lastReading ? lastReading.weight_kg.toFixed(1) : '84.6'}
          accessibilityLabel="Weight in kilograms"
        />
      </View>
      {showError ? (
        <ErrorText message={`That looks off. Enter ${MIN_KG}–${MAX_KG} kg.`} />
      ) : (
        <T variant="footnote">
          Best first thing in the morning, after the toilet, before eating or drinking.
          {lastReading ? <Text style={{ color: c.text3 }}> Last: {lastReading.weight_kg.toFixed(1)} kg, {formatDay(lastReading.date)}.</Text> : null}
        </T>
      )}
      <ErrorText message={error} />
      <Button title={existing ? 'Update' : 'Save'} size="L" onPress={save} loading={busy} disabled={invalid} />

      {trend.length > 0 ? (
        <Card hero style={{ gap: Spacing.md }}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <View style={{ gap: 2 }}>
              <Overline>Trend</Overline>
              <Num size="l" style={{ fontSize: 34, lineHeight: 38 }}>
                {trend.at(-1)!.trend.toFixed(1)}
                <Text style={{ fontSize: 17, fontWeight: '500', color: c.text2, fontFamily: undefined }}> kg</Text>
              </Num>
            </View>
            {rate != null && enough ? (
              <View style={{ alignItems: 'flex-end' }}>
                <Num size="m" color={levelColor} style={{ fontSize: 20, lineHeight: 24 }}>
                  {rate < 0 ? '−' : '+'}
                  {Math.abs(rate).toFixed(2)}
                </Num>
                <T variant="caption" style={{ fontWeight: '400' }}>
                  kg/week
                </T>
              </View>
            ) : null}
          </Row>
          {enough ? (
            <>
              <Row gap={Spacing.md} style={{ alignItems: 'flex-start' }}>
                <LevelIcon level={level} size={28} />
                <T style={{ flex: 1, fontSize: 14, lineHeight: 19 }}>{paceText}</T>
              </Row>
              <WeightChart points={trend} goalRatePerWeek={goalRate || undefined} />
              <T variant="footnote">Dots are weigh-ins; the line is the trend, which smooths out water and food weight. Dashed is your goal pace.</T>
            </>
          ) : (
            <View style={{ gap: Spacing.sm }}>
              <Row gap={6}>
                {[0, 1, 2].map((i) => (
                  <View
                    key={i}
                    style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: i < data.weighIns.length ? c.accentLine : c.track }}
                  />
                ))}
                <T variant="footnote" style={{ marginLeft: 4 }}>
                  {data.weighIns.length} of 3 weigh-ins
                </T>
              </Row>
              <T variant="footnote">
                A trend needs at least three weigh-ins over a week or so. Until then, day-to-day water and food weight would
                drown out real change.
              </T>
            </View>
          )}
        </Card>
      ) : null}

      {recent.length > 0 ? (
        <>
          <Overline>Recent</Overline>
          <Card style={{ gap: 0, paddingVertical: 4, overflow: 'hidden' }}>
            {recent.map((w, i) => {
              const prev = recent[i + 1];
              const change = prev ? w.weight_kg - prev.weight_kg : null;
              return (
                <ReanimatedSwipeable
                  key={w.id}
                  friction={2}
                  rightThreshold={40}
                  overshootRight={false}
                  renderRightActions={(_p, _t, m) => (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${formatDay(w.date)}`}
                      onPress={() => {
                        m.close();
                        remove(w.id, `${formatDay(w.date)} · ${w.weight_kg} kg`);
                      }}
                      style={{ width: 80, backgroundColor: c.alert, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: c.onAlert, fontWeight: '700' }}>Delete</Text>
                    </Pressable>
                  )}>
                  <Pressable
                    onLongPress={() => remove(w.id, `${formatDay(w.date)} · ${w.weight_kg} kg`)}
                    style={{
                      minHeight: 44,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: Spacing.md,
                      backgroundColor: c.surface,
                      borderTopWidth: i === 0 ? 0 : 1,
                      borderTopColor: c.line,
                    }}>
                    <T style={{ flex: 1 }}>{formatDay(w.date)}</T>
                    {change != null ? (
                      <Text
                        style={{ fontSize: 13, fontWeight: '600', color: change > 0.05 ? c.warn : c.text2, fontVariant: ['tabular-nums'] }}>
                        {change > 0 ? '+' : change < 0 ? '−' : '±'}
                        {Math.abs(change).toFixed(1)}
                      </Text>
                    ) : null}
                    <Num size="xs" style={{ minWidth: 64, textAlign: 'right' }}>
                      {w.weight_kg.toFixed(1)} kg
                    </Num>
                  </Pressable>
                </ReanimatedSwipeable>
              );
            })}
          </Card>
          <T variant="footnote">Swipe left or press and hold to delete.</T>
        </>
      ) : null}
    </Screen>
  );
}
