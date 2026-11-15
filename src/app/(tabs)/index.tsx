import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, RefreshControl, View } from 'react-native';

import { FastingCard } from '@/components/fasting-card';
import { Ring } from '@/components/ring';
import {
  Button,
  Card,
  Divider,
  ErrorText,
  fmt,
  Loading,
  Row,
  Screen,
  Stepper,
  T,
} from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { useTheme } from '@/hooks/use-theme';
import {
  deleteFood,
  getProfile,
  isProfileComplete,
  listFood,
  listSessions,
  type FoodEntry,
} from '@/lib/api';
import { addDays, formatDay, isValidISODate, today } from '@/lib/dates';
import { parseClock } from '@/lib/fasting';
import { defaultSlotForNow, resolveSlots, slotsForData } from '@/lib/meals';
import { ACTIVITY_LABELS, sumTotals } from '@/lib/nutrition';
import { sessionKcal, targetFor } from '@/lib/targets';

export default function TodayScreen() {
  const c = useTheme();
  const params = useLocalSearchParams<{ date?: string }>();
  const [date, setDate] = useState(() =>
    params.date && isValidISODate(params.date) ? params.date : today(),
  );

  // The Week screen links here with ?date=...; follow it when it changes.
  const [linkedDate, setLinkedDate] = useState(params.date);
  if (params.date !== linkedDate) {
    setLinkedDate(params.date);
    if (params.date && isValidISODate(params.date)) setDate(params.date);
  }

  const { data, error, loading, reload } = useAsync(async () => {
    const [profile, sessions, food] = await Promise.all([
      getProfile(),
      listSessions(date, date),
      listFood(date, date),
    ]);
    return { profile, sessions, food };
  }, date);

  const isToday = date === today();
  const label = isToday ? `Today · ${formatDay(date)}` : formatDay(date);

  if (!data) {
    return (
      <Screen>
        <Stepper label={label} onPrev={() => setDate(addDays(date, -1))} onNext={() => setDate(addDays(date, 1))} />
        {error ? <ErrorText message={error} /> : <Loading />}
      </Screen>
    );
  }

  const { profile, sessions, food } = data;
  const target = targetFor(profile, date, sessions);
  const eaten = sumTotals(food);
  const remaining = target ? target.kcal - eaten.kcal : 0;

  const slots = resolveSlots(profile.meal_slots);
  const windowStart = parseClock(profile.eating_window_start);
  const windowEnd = parseClock(profile.eating_window_end);
  const fastingWindow =
    windowStart != null && windowEnd != null ? { startMin: windowStart, endMin: windowEnd } : null;
  const defaultMeal = isToday
    ? defaultSlotForNow(slots, new Date(), fastingWindow)
    : slots[slots.length - 1].key;
  const addFoodManually = () => router.push({ pathname: '/food', params: { date, meal: defaultMeal } });
  const scan = () => router.push({ pathname: '/scan', params: { date, meal: defaultMeal } });

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}>
      <Stepper label={label} onPrev={() => setDate(addDays(date, -1))} onNext={() => setDate(addDays(date, 1))} />
      {!isToday ? <Button title="Jump to today" variant="ghost" onPress={() => setDate(today())} /> : null}
      <ErrorText message={error} />

      {!isProfileComplete(profile) || !target ? (
        <Card>
          <T variant="heading">Set up your profile</T>
          <T variant="muted">
            Add your sex, birth date, height and weight so we can work out your daily targets.
          </T>
          <Button title="Go to profile" onPress={() => router.navigate('/profile')} />
        </Card>
      ) : (
        <>
          {/* Calories + macros */}
          <Card style={{ gap: Spacing.lg, paddingVertical: Spacing.xl }}>
            <Row gap={Spacing.xl} style={{ alignItems: 'center' }}>
              <Ring value={eaten.kcal} max={target.kcal} size={156} stroke={14}>
                <T variant="big" color={remaining < 0 ? c.danger : c.text} style={{ fontSize: 34 }}>
                  {fmt(Math.abs(remaining))}
                </T>
                <T variant="small">{remaining < 0 ? 'kcal over' : 'kcal left'}</T>
              </Ring>
              <View style={{ flex: 1, gap: Spacing.sm }}>
                <Stat label="Eaten" value={fmt(eaten.kcal)} />
                <Stat label="Target" value={fmt(target.kcal)} />
                <Stat label="Base" value={fmt(target.base)} small />
                <Stat label="Training" value={`+${fmt(target.training)}`} color={c.training} small />
              </View>
            </Row>
            <Row style={{ justifyContent: 'space-around' }}>
              <MacroRing label="Protein" value={eaten.proteinG} target={target.proteinG} color={c.protein} />
              <MacroRing label="Carbs" value={eaten.carbsG} target={target.carbsG} color={c.carbs} />
              <MacroRing label="Fat" value={eaten.fatG} target={target.fatG} color={c.fat} />
            </Row>
            {target.flooredAtBmr ? (
              <T variant="small">
                Your goal deficit was capped so the base target doesn’t drop below your BMR ({fmt(target.bmr)}).
              </T>
            ) : null}
          </Card>
        </>
      )}

      {isToday && fastingWindow ? <FastingCard {...fastingWindow} /> : null}

      {/* Actions */}
      <Row>
        <Button title="Scan meal" icon="📷" onPress={scan} style={{ flex: 1 }} />
        <Button title="Add food" variant="secondary" onPress={addFoodManually} style={{ flex: 1 }} />
      </Row>

      {/* Training */}
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <T variant="heading">Training</T>
          <Pressable onPress={() => router.push({ pathname: '/training', params: { date } })} hitSlop={8}>
            <T color={c.primary}>+ Add</T>
          </Pressable>
        </Row>
        {sessions.length === 0 ? (
          <T variant="muted">Rest day. No sessions planned.</T>
        ) : (
          sessions.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => router.push({ pathname: '/training', params: { id: s.id, date } })}>
              <Row style={{ justifyContent: 'space-between', paddingVertical: Spacing.xs }}>
                <T>
                  {ACTIVITY_LABELS[s.activity]} · {s.duration_min} min · {s.intensity}
                </T>
                <T color={c.training}>+{fmt(sessionKcal(profile, s) ?? 0)}</T>
              </Row>
            </Pressable>
          ))
        )}
      </Card>

      {/* Meals */}
      {slotsForData(
        slots,
        food.map((f) => f.meal),
      ).map(({ key: meal, label }) => {
        const items = food.filter((f) => f.meal === meal);
        const total = sumTotals(items);
        return (
          <Card key={meal}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T variant="heading">{label}</T>
              <Row gap={Spacing.lg}>
                {items.length > 0 ? <T variant="muted">{fmt(total.kcal)} kcal</T> : null}
                <Pressable onPress={() => router.push({ pathname: '/food', params: { date, meal } })} hitSlop={8}>
                  <T color={c.primary}>+ Add</T>
                </Pressable>
              </Row>
            </Row>
            {items.length === 0 ? <T variant="small">Nothing logged</T> : null}
            {items.map((f, i) => (
              <View key={f.id}>
                {i > 0 ? <Divider /> : null}
                <FoodRow entry={f} onDeleted={reload} />
              </View>
            ))}
          </Card>
        );
      })}
    </Screen>
  );
}

function Stat({ label, value, color, small }: { label: string; value: string; color?: string; small?: boolean }) {
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <T variant={small ? 'small' : 'muted'}>{label}</T>
      <T variant={small ? 'muted' : 'heading'} color={color} style={{ fontVariant: ['tabular-nums'] }}>
        {value}
      </T>
    </Row>
  );
}

function MacroRing({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  return (
    <View style={{ alignItems: 'center', gap: Spacing.xs }}>
      <Ring value={value} max={target} size={78} stroke={8} color={color}>
        <T variant="heading" style={{ fontVariant: ['tabular-nums'] }}>
          {fmt(value)}
        </T>
      </Ring>
      <T variant="small" color={color}>
        {label}
      </T>
      <T variant="small">of {fmt(target)} g</T>
    </View>
  );
}

function FoodRow({ entry, onDeleted }: { entry: FoodEntry; onDeleted: () => void }) {
  const c = useTheme();
  const confirmDelete = () =>
    Alert.alert('Delete entry?', entry.name, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteFood(entry.id);
            onDeleted();
          } catch (e) {
            Alert.alert('Could not delete', e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/food', params: { id: entry.id } })}
      onLongPress={confirmDelete}
      style={{ paddingVertical: Spacing.sm }}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <T numberOfLines={1}>
            {entry.source === 'photo' ? '📷 ' : ''}
            {entry.name}
          </T>
          <T variant="small">
            {entry.serving ? `${entry.serving} · ` : ''}P {fmt(entry.protein_g)} · C {fmt(entry.carbs_g)} · F{' '}
            {fmt(entry.fat_g)}
          </T>
        </View>
        <T color={c.text}>{fmt(entry.kcal)}</T>
      </Row>
    </Pressable>
  );
}
