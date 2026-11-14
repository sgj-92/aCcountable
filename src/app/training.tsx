import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { Button, Card, Chip, ErrorText, Field, fmt, Loading, Row, Screen, Segmented, Stepper, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { deleteSession, getProfile, getSession, saveSession, type Profile } from '@/lib/api';
import { addDays, formatDay, isValidISODate, today } from '@/lib/dates';
import { ACTIVITY_LABELS, sessionBurn, type Activity, type Intensity } from '@/lib/nutrition';

const ACTIVITIES = Object.keys(ACTIVITY_LABELS) as Activity[];

export default function TrainingEditor() {
  const c = useTheme();
  const params = useLocalSearchParams<{ id?: string; date?: string }>();
  const id = params.id;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loaded, setLoaded] = useState(!id);
  const [date, setDate] = useState(params.date && isValidISODate(params.date) ? params.date : today());
  const [activity, setActivity] = useState<Activity>('run');
  const [duration, setDuration] = useState('45');
  const [intensity, setIntensity] = useState<Intensity>('moderate');
  const [override, setOverride] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getProfile().then(setProfile, (e) => setError(String(e)));
    if (id) {
      getSession(id).then(
        (s) => {
          setDate(s.date);
          setActivity(s.activity);
          setDuration(String(s.duration_min));
          setIntensity(s.intensity);
          setOverride(s.kcal_override != null ? String(s.kcal_override) : '');
          setNotes(s.notes ?? '');
          setLoaded(true);
        },
        (e) => setError(e instanceof Error ? e.message : String(e)),
      );
    }
  }, [id]);

  const durationMin = Number(duration);
  const kcalOverride = override.trim() === '' ? null : Number(override);
  const invalid =
    !Number.isInteger(durationMin) || durationMin < 1 || durationMin > 1440
      ? 'Duration must be 1–1440 minutes'
      : kcalOverride != null && (!Number.isFinite(kcalOverride) || kcalOverride < 0)
        ? 'Calories must be a positive number'
        : null;

  const estimate =
    profile?.weight_kg && !invalid
      ? (sessionBurn({ activity, durationMin, intensity, kcalOverride }, profile.weight_kg) *
          profile.training_eat_back_pct) /
        100
      : null;

  async function save() {
    if (invalid) return;
    setBusy(true);
    setError(null);
    try {
      await saveSession(
        {
          date,
          activity,
          duration_min: durationMin,
          intensity,
          kcal_override: kcalOverride == null ? null : Math.round(kcalOverride),
          notes: notes.trim() || null,
        },
        id,
      );
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  function remove() {
    if (!id) return;
    Alert.alert('Delete session?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteSession(id);
            router.back();
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);
  }

  if (!loaded) {
    return (
      <Screen padTop={false}>
        {error ? <ErrorText message={error} /> : <Loading />}
      </Screen>
    );
  }

  return (
    <Screen padTop={false}>
      <Stack.Screen options={{ title: id ? 'Edit session' : 'Add session' }} />
      <Card>
        <Stepper label={formatDay(date)} onPrev={() => setDate(addDays(date, -1))} onNext={() => setDate(addDays(date, 1))} />
      </Card>

      <Card style={{ gap: Spacing.md }}>
        <T variant="heading">Activity</T>
        <Row style={{ flexWrap: 'wrap' }}>
          {ACTIVITIES.map((a) => (
            <Chip key={a} label={ACTIVITY_LABELS[a]} active={activity === a} color={c.training} onPress={() => setActivity(a)} />
          ))}
        </Row>
        <Field label="Duration (minutes)" value={duration} onChangeText={setDuration} keyboardType="number-pad" />
        <View style={{ gap: Spacing.xs }}>
          <T variant="small">Intensity</T>
          <Segmented
            value={intensity}
            onChange={setIntensity}
            options={[
              { label: 'Easy', value: 'easy' },
              { label: 'Moderate', value: 'moderate' },
              { label: 'Hard', value: 'hard' },
            ]}
          />
        </View>
        <Field
          label="Calories burned (optional)"
          placeholder="e.g. active kcal from your watch"
          value={override}
          onChangeText={setOverride}
          keyboardType="number-pad"
          hint="Leave blank to estimate from activity, duration and intensity."
        />
        <Field label="Notes (optional)" value={notes} onChangeText={setNotes} placeholder="e.g. 6×800m intervals" />
      </Card>

      {estimate != null ? (
        <Card>
          <T variant="small">Adds to this day’s target</T>
          <T variant="big" color={c.training}>
            +{fmt(estimate)} kcal
          </T>
          {profile && profile.training_eat_back_pct !== 100 ? (
            <T variant="small">Includes your {profile.training_eat_back_pct}% eat-back setting.</T>
          ) : null}
        </Card>
      ) : null}

      <ErrorText message={invalid ?? error} />
      <Button title={id ? 'Save changes' : 'Add session'} onPress={save} loading={busy} disabled={!!invalid} />
      {id ? <Button title="Delete session" variant="ghost" onPress={remove} /> : null}
    </Screen>
  );
}
