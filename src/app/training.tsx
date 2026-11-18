import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { Button, Card, Chip, ErrorText, Field, fmt, Loading, Row, Screen, Segmented, Stepper, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { deleteSession, getProfile, getSession, listWhoopWorkouts, saveSession, type Profile } from '@/lib/api';
import { addDays, formatDay, isValidISODate, today } from '@/lib/dates';
import { ACTIVITY_LABELS, type Activity, type Intensity } from '@/lib/nutrition';
import { sessionKcalDetail } from '@/lib/targets';
import { ratesForModel, ratesFromRows, type ActivityRate } from '@/lib/whoop';

const ACTIVITIES = Object.keys(ACTIVITY_LABELS) as Activity[];

const parseOptional = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));

export default function TrainingEditor() {
  const c = useTheme();
  const params = useLocalSearchParams<{ id?: string; date?: string }>();
  const id = params.id;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [whoopRates, setWhoopRates] = useState<ActivityRate[]>([]);
  const [whoopNamed, setWhoopNamed] = useState<ActivityRate[]>([]);
  const [whoopActivity, setWhoopActivity] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(!id);
  const [date, setDate] = useState(params.date && isValidISODate(params.date) ? params.date : today());
  const [activity, setActivity] = useState<Activity>('run');
  const [duration, setDuration] = useState('45');
  const [intensity, setIntensity] = useState<Intensity>('moderate');
  const [override, setOverride] = useState('');
  const [actualKcal, setActualKcal] = useState('');
  const [actualDuration, setActualDuration] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getProfile().then(setProfile, (e) => setError(String(e)));
    listWhoopWorkouts().then(
      (w) => {
        const r = ratesFromRows(w);
        setWhoopRates(r.byActivity);
        setWhoopNamed(r.byName);
      },
      () => {},
    );
    if (id) {
      getSession(id).then(
        (s) => {
          setDate(s.date);
          setActivity(s.activity);
          setDuration(String(s.duration_min));
          setIntensity(s.intensity);
          setOverride(s.kcal_override != null ? String(s.kcal_override) : '');
          setActualKcal(s.actual_kcal != null ? String(s.actual_kcal) : '');
          setActualDuration(s.actual_duration_min != null ? String(s.actual_duration_min) : '');
          setWhoopActivity(s.whoop_activity);
          setNotes(s.notes ?? '');
          setLoaded(true);
        },
        (e) => setError(e instanceof Error ? e.message : String(e)),
      );
    }
  }, [id]);

  const durationMin = Number(duration);
  const kcalOverride = parseOptional(override);
  const actual = parseOptional(actualKcal);
  const actualMin = parseOptional(actualDuration);
  const canConfirm = date <= today();
  const invalid =
    !Number.isInteger(durationMin) || durationMin < 1 || durationMin > 1440
      ? 'Duration must be 1–1440 minutes'
      : [kcalOverride, actual].some((v) => v != null && (!Number.isFinite(v) || v < 0 || v > 10000))
        ? 'Calories must be between 0 and 10,000'
        : actualMin != null && (!Number.isInteger(actualMin) || actualMin < 1 || actualMin > 1440)
          ? 'Actual duration must be 1–1440 minutes'
          : null;

  const named = whoopActivity
    ? whoopNamed.find((r) => r.label.toLowerCase() === whoopActivity.toLowerCase())
    : undefined;
  const rate = named ?? whoopRates.find((r) => r.activity === activity);
  const detail =
    profile && !invalid
      ? sessionKcalDetail(
          profile,
          {
            id: id ?? 'new',
            date,
            activity,
            duration_min: durationMin,
            intensity,
            kcal_override: kcalOverride,
            actual_kcal: canConfirm ? actual : null,
            actual_duration_min: canConfirm ? actualMin : null,
            whoop_activity: whoopActivity,
            notes: null,
          },
          ratesForModel(whoopRates, whoopNamed),
        )
      : null;

  const sourceText = !detail
    ? null
    : detail.source === 'actual'
      ? 'Confirmed from WHOOP'
      : detail.source === 'manual'
        ? 'Your estimate'
        : detail.source === 'history'
          ? `Estimated from your ${detail.samples} WHOOP “${rate?.label ?? ''}” session${detail.samples === 1 ? '' : 's'}`
          : 'Generic estimate. Import WHOOP history for your own rates';

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
          actual_kcal: canConfirm && actual != null ? Math.round(actual) : null,
          actual_duration_min: canConfirm && actualMin != null ? actualMin : null,
          whoop_activity: whoopActivity,
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
    Alert.alert('Delete session?', 'Use this if the session didn’t happen; the day’s target drops back.', [
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

  // WHOOP activities, most-logged first; keep an edited session's own name even if it's not in the history.
  const whoopChoices =
    whoopActivity && !whoopNamed.some((r) => r.label.toLowerCase() === whoopActivity.toLowerCase())
      ? [...whoopNamed, { label: whoopActivity, activity, kcalPerMin: 0, samples: 0, typicalMin: durationMin }]
      : whoopNamed;

  if (!loaded) {
    return <Screen padTop={false}>{error ? <ErrorText message={error} /> : <Loading />}</Screen>;
  }

  return (
    <Screen padTop={false}>
      <Stack.Screen options={{ title: id ? 'Edit session' : 'Add session' }} />
      <Card>
        <Stepper label={formatDay(date)} onPrev={() => setDate(addDays(date, -1))} onNext={() => setDate(addDays(date, 1))} />
      </Card>

      <Card style={{ gap: Spacing.md }}>
        {whoopChoices.length > 0 ? (
          <>
            <T variant="heading">Your WHOOP activities</T>
            <Row style={{ flexWrap: 'wrap' }}>
              {whoopChoices.map((r) => (
                <Chip
                  key={r.label}
                  label={r.label}
                  active={whoopActivity?.toLowerCase() === r.label.toLowerCase()}
                  color={c.training}
                  onPress={() => {
                    setWhoopActivity(r.label);
                    setActivity(r.activity);
                    // Start from the person's usual session length for this activity.
                    if (!id && r.samples > 0) setDuration(String(r.typicalMin));
                  }}
                />
              ))}
            </Row>
            {named ? (
              <T variant="small">
                Usually {named.typicalMin} min · about {fmt(named.kcalPerMin * named.typicalMin)} kcal on WHOOP ·{' '}
                {named.samples} session{named.samples === 1 ? '' : 's'}
              </T>
            ) : null}
            <T variant="heading" style={{ marginTop: Spacing.sm }}>
              Other activities
            </T>
          </>
        ) : (
          <T variant="heading">Activity</T>
        )}
        <Row style={{ flexWrap: 'wrap' }}>
          {ACTIVITIES.map((a) => (
            <Chip
              key={a}
              label={ACTIVITY_LABELS[a]}
              active={!whoopActivity && activity === a}
              color={c.training}
              onPress={() => {
                setWhoopActivity(null);
                setActivity(a);
                const r = whoopRates.find((x) => x.activity === a);
                if (!id && r) setDuration(String(r.typicalMin));
              }}
            />
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
        <Field label="Notes (optional)" value={notes} onChangeText={setNotes} placeholder="e.g. doubles, 2 sets" />
      </Card>

      {canConfirm ? (
        <Card style={{ gap: Spacing.md }}>
          <T variant="heading">How did it go?</T>
          <T variant="small">
            After the session, enter what WHOOP recorded. The day’s target and the rest of the week re-balance on the
            real number. Re-importing your WHOOP export fills this in automatically.
          </T>
          <Row gap={Spacing.md}>
            <Field
              style={{ flex: 1 }}
              label="WHOOP calories"
              placeholder="e.g. 820"
              value={actualKcal}
              onChangeText={setActualKcal}
              keyboardType="number-pad"
            />
            <Field
              style={{ flex: 1 }}
              label="Actual minutes"
              placeholder={duration}
              value={actualDuration}
              onChangeText={setActualDuration}
              keyboardType="number-pad"
            />
          </Row>
        </Card>
      ) : null}

      {detail ? (
        <Card>
          <T variant="small">Adds to {formatDay(date)}’s target</T>
          <T variant="big" color={c.training}>
            +{fmt(detail.added)} kcal
          </T>
          <T variant="small">{sourceText}</T>
          <T variant="small">
            WHOOP calories include your resting burn for that time, which your base target already covers, so that part
            is taken off.
            {profile && profile.training_eat_back_pct !== 100 ? ` Includes your ${profile.training_eat_back_pct}% eat-back setting.` : ''}
          </T>
        </Card>
      ) : null}

      {detail?.source !== 'actual' ? (
        <Field
          label="Override the estimate (optional)"
          placeholder="Total calories you expect, as WHOOP would show them"
          value={override}
          onChangeText={setOverride}
          keyboardType="number-pad"
        />
      ) : null}

      <ErrorText message={invalid ?? error} />
      <Button title={id ? 'Save changes' : 'Add session'} onPress={save} loading={busy} disabled={!!invalid} />
      {id ? <Button title="Delete session" variant="ghost" onPress={remove} /> : null}
    </Screen>
  );
}
