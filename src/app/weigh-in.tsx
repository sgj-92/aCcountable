import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { WeightChart } from '@/components/weight-chart';
import { Button, Card, Divider, ErrorText, Field, Loading, Row, Screen, Stepper, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';
import { deleteWeighIn, getProfile, listWeighIns, saveWeighIn, updateProfile } from '@/lib/api';
import { addDays, formatDay, today } from '@/lib/dates';
import { judgePace, weeklyRate, weightTrend } from '@/lib/weight';

export default function WeighInScreen() {
  const c = useTheme();
  const { reload: reloadSharedProfile } = useProfile();
  const [date, setDate] = useState(today());
  const [weight, setWeight] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, reload } = useAsync(async () => {
    const [profile, weighIns] = await Promise.all([getProfile(), listWeighIns(addDays(today(), -90))]);
    return { profile, weighIns };
  }, 'weigh-ins');

  if (!data) return <Screen padTop={false}><Loading /></Screen>;

  const trend = weightTrend(data.weighIns);
  const rate = weeklyRate(trend);
  const pace = judgePace(rate, data.profile.goal, data.profile.goal_rate_kg_per_week);
  const kg = Number(weight.replace(',', '.'));
  const invalid = !Number.isFinite(kg) || kg < 30 || kg > 300;

  async function save() {
    if (invalid) return;
    setBusy(true);
    setError(null);
    try {
      await saveWeighIn(date, Math.round(kg * 100) / 100);
      // Keep the profile weight (which drives targets) on the smoothed trend, not the day's reading.
      const all = await listWeighIns(addDays(today(), -90));
      const latest = weightTrend(all).at(-1);
      if (latest) await updateProfile(data!.profile.id, { weight_kg: Math.round(latest.trend * 10) / 10 });
      await reloadSharedProfile();
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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

  const paceText =
    rate == null
      ? 'Log a few weigh-ins over a week or more to see your rate.'
      : `${rate < 0 ? 'Losing' : 'Gaining'} ${Math.abs(rate).toFixed(2)} kg/week · ${
          pace === 'on-track'
            ? 'on pace'
            : pace === 'too-slow'
              ? 'slower than your goal'
              : pace === 'too-fast'
                ? 'faster than your goal'
                : pace === 'wrong-direction'
                  ? 'wrong direction for your goal'
                  : ''
        }`;

  return (
    <Screen padTop={false}>
      <Stack.Screen options={{ title: 'Weight' }} />
      <Card style={{ gap: Spacing.md }}>
        <Stepper label={date === today() ? `Today · ${formatDay(date)}` : formatDay(date)} onPrev={() => setDate(addDays(date, -1))} onNext={() => setDate(addDays(date, 1))} />
        <Field
          label="Weight (kg)"
          placeholder={data.profile.weight_kg ? String(data.profile.weight_kg) : 'e.g. 84.6'}
          value={weight}
          onChangeText={setWeight}
          keyboardType="decimal-pad"
          autoFocus
        />
        <T variant="small">Best first thing in the morning, after the toilet, before eating or drinking.</T>
        <ErrorText message={weight && invalid ? 'Enter a weight between 30 and 300 kg' : error} />
        <Button title="Save" onPress={save} loading={busy} disabled={invalid} />
      </Card>

      {trend.length > 0 ? (
        <Card style={{ gap: Spacing.sm }}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <View>
              <T variant="small">Trend</T>
              <T variant="big" style={{ fontSize: 32 }}>
                {trend.at(-1)!.trend.toFixed(1)} kg
              </T>
            </View>
          </Row>
          <T variant="muted" color={pace === 'on-track' ? c.success : pace === 'not-enough-data' ? c.textMuted : c.danger}>
            {paceText}
          </T>
          <WeightChart points={trend} />
          <T variant="small">Dots are weigh-ins; the line is the trend, which smooths out water and food weight.</T>
        </Card>
      ) : null}

      {data.weighIns.length > 0 ? (
        <Card style={{ gap: 0 }}>
          <T variant="heading" style={{ marginBottom: Spacing.xs }}>
            Recent
          </T>
          {[...data.weighIns]
            .reverse()
            .slice(0, 14)
            .map((w, i) => (
              <View key={w.id}>
                {i > 0 ? <Divider /> : null}
                <Pressable onLongPress={() => remove(w.id, `${formatDay(w.date)} · ${w.weight_kg} kg`)} style={{ paddingVertical: Spacing.sm }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <T>{formatDay(w.date)}</T>
                    <T>{w.weight_kg.toFixed(1)} kg</T>
                  </Row>
                </Pressable>
              </View>
            ))}
          <T variant="small" style={{ marginTop: Spacing.xs }}>
            Press and hold to delete.
          </T>
        </Card>
      ) : null}
    </Screen>
  );
}
