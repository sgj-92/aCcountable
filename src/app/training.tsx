import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, TextInput, View } from 'react-native';

import { Icon } from '@/components/icon';

import { FOOTER_SPACE, SheetFooter } from '@/components/sheet';
import { StatusPill } from '@/components/tiles';
import { Button, Card, ErrorText, Field, fmt, IconButton, Loading, Num, Row, Screen, Segmented, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useCountUp } from '@/hooks/use-count-up';
import { useTheme } from '@/hooks/use-theme';
import { deleteSession, getProfile, getSession, listWhoopWorkouts, saveSession, type Profile } from '@/lib/api';
import { addDays, formatDay, isValidISODate, today } from '@/lib/dates';
import { formatClock, formatClockInput, parseClock } from '@/lib/fasting';
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
  const [startTime, setStartTime] = useState('');
  const [showOverride, setShowOverride] = useState(false);
  const [durationFocused, setDurationFocused] = useState(false);
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
          setShowOverride(s.kcal_override != null);
          setActualKcal(s.actual_kcal != null ? String(s.actual_kcal) : '');
          setActualDuration(s.actual_duration_min != null ? String(s.actual_duration_min) : '');
          setWhoopActivity(s.whoop_activity);
          setNotes(s.notes ?? '');
          setStartTime(s.start_time ?? '');
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

  // What the estimate would be without your own figure, for the override note.
  const overrideBase =
    profile && !invalid && kcalOverride != null
      ? sessionKcalDetail(
          profile,
          {
            id: id ?? 'new',
            date,
            activity,
            duration_min: durationMin,
            intensity,
            kcal_override: null,
            actual_kcal: null,
            actual_duration_min: null,
            whoop_activity: whoopActivity,
            notes: null,
          },
          ratesForModel(whoopRates, whoopNamed),
        )?.net
      : null;

  const sourceText = !detail
    ? null
    : detail.source === 'actual'
      ? 'Confirmed from WHOOP'
      : detail.source === 'manual'
        ? 'Your own number'
        : detail.source === 'history'
          ? `Estimated from your ${detail.samples} WHOOP “${rate?.label ?? ''}” session${detail.samples === 1 ? '' : 's'}`
          : 'Typical estimate for this activity. Import WHOOP history for your own rates';

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
          start_time: parseClock(startTime) != null ? formatClock(parseClock(startTime)!) : null,
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

  const estimateOnly =
    profile && !invalid && canConfirm && actual != null
      ? sessionKcalDetail(
          profile,
          {
            id: id ?? 'new',
            date,
            activity,
            duration_min: durationMin,
            intensity,
            kcal_override: kcalOverride,
            actual_kcal: null,
            actual_duration_min: null,
            whoop_activity: whoopActivity,
            notes: null,
          },
          ratesForModel(whoopRates, whoopNamed),
        )
      : null;
  const confirmed = detail?.source === 'actual';
  const shownAdded = useCountUp(detail?.added ?? 0, 400);
  const dayLabel = date === today() ? 'today’s' : `${formatDay(date)}’s`;

  if (!loaded) {
    return <Screen padTop={false}>{error ? <ErrorText message={error} /> : <Loading />}</Screen>;
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Screen padTop={false} padBottom={FOOTER_SPACE + Spacing.lg}>
        <Stack.Screen options={{ title: id ? 'Edit session' : 'Add session' }} />
        <Row style={{ height: 44, borderRadius: 22, backgroundColor: c.raised, justifyContent: 'space-between' }}>
          <IconButton glyph="‹" label="Previous day" background="transparent" onPress={() => setDate(addDays(date, -1))} />
          <T variant="headline">{date === today() ? `Today · ${formatDay(date)}` : formatDay(date)}</T>
          <IconButton glyph="›" label="Next day" background="transparent" onPress={() => setDate(addDays(date, 1))} />
        </Row>

        <ActivityPicker
          whoop={whoopChoices}
          selected={whoopActivity ? { kind: 'whoop', label: whoopActivity } : { kind: 'generic', activity }}
          onPick={(choice) => {
            if (choice.kind === 'whoop') {
              setWhoopActivity(choice.rate.label);
              setActivity(choice.rate.activity);
              // Start from the person's usual session length for this activity.
              if (!id && choice.rate.samples > 0) setDuration(String(choice.rate.typicalMin));
            } else {
              setWhoopActivity(null);
              setActivity(choice.activity);
              const r = whoopRates.find((x) => x.activity === choice.activity);
              if (!id && r) setDuration(String(r.typicalMin));
            }
          }}
        />
        {named ? (
          <T variant="footnote" style={{ fontVariant: ['tabular-nums'], paddingHorizontal: 4 }}>
            Usually {named.typicalMin} min · about {fmt(named.kcalPerMin * named.typicalMin)} kcal ·{' '}
            {named.samples} session{named.samples === 1 ? '' : 's'}
          </T>
        ) : null}

        <Row gap={Spacing.sm} style={{ alignItems: 'flex-end' }}>
          <View style={{ width: 120, gap: 6 }}>
            <T variant="footnote">Duration</T>
            <Row
              gap={4}
              style={{ height: 52, borderRadius: Radius.md, backgroundColor: c.raised, paddingHorizontal: 14, borderWidth: 2, borderColor: durationFocused ? c.accentLine : 'transparent' }}>
              <TextInput
                value={duration}
                onChangeText={setDuration}
                keyboardType="number-pad"
                selectTextOnFocus
                accessibilityLabel="Duration in minutes"
                onFocus={() => setDurationFocused(true)}
                onBlur={() => setDurationFocused(false)}
                selectionColor={c.accentLine}
                maxFontSizeMultiplier={1.3}
                style={{ flex: 1, fontFamily: 'Archivo_800ExtraBold', fontSize: 20, color: c.text, padding: 0 }}
              />
              <T variant="footnote">min</T>
            </Row>
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <T variant="footnote">Intensity</T>
            <Segmented
              height={52}
              value={intensity}
              onChange={setIntensity}
              options={[
                { label: 'Easy', value: 'easy' },
                { label: 'Moderate', value: 'moderate' },
                { label: 'Hard', value: 'hard' },
              ]}
            />
          </View>
        </Row>
        <Row gap={Spacing.sm} style={{ alignItems: 'flex-start' }}>
          <Field
            style={{ width: 120 }}
            label="Starts at"
            value={startTime}
            onChangeText={(v) => setStartTime(formatClockInput(v))}
            placeholder="18:00"
            keyboardType="number-pad"
            maxLength={5}
            error={startTime && parseClock(startTime) == null ? 'Use HH:MM' : null}
          />
          <Field style={{ flex: 1 }} label="Notes · optional" value={notes} onChangeText={setNotes} placeholder="e.g. doubles, 2 sets" />
        </Row>
        <T variant="footnote" style={{ marginTop: -Spacing.xs, paddingHorizontal: 4 }}>
          Add a start time and your meals are timed around it: one about 2 h before, one about 1 h after.
        </T>

        {detail ? (
          <View
            accessible
            accessibilityLabel={`Adds ${confirmed ? '' : 'about '}${fmt(detail.net)} kcal to ${dayLabel} target, ${fmt(detail.added)} counted. ${sourceText}`}
            style={{ backgroundColor: c.trainingBg, borderRadius: 20, paddingVertical: 14, paddingHorizontal: Spacing.lg, gap: 4 }}>
            <Row gap={Spacing.sm} style={{ alignItems: 'baseline' }}>
              <Num size="l" color={c.training}>
                {confirmed ? '' : '≈ '}+{fmt(shownAdded)}
              </Num>
              <T style={{ fontWeight: '600', flex: 1 }}>kcal adds to {dayLabel} target</T>
            </Row>
            {profile && profile.training_eat_back_pct !== 100 ? (
              <T variant="footnote" style={{ fontVariant: ['tabular-nums'] }}>
                {fmt(detail.net)} burned beyond resting · {profile.training_eat_back_pct}% eaten back
              </T>
            ) : (
              <T variant="footnote" style={{ fontVariant: ['tabular-nums'] }}>
                {fmt(detail.net)} burned beyond resting
              </T>
            )}
            {confirmed ? (
              <View style={{ marginTop: 4 }}>
                <StatusPill label="✓ Confirmed from WHOOP" tone="good" />
              </View>
            ) : (
              <T variant="caption" style={{ fontWeight: '400' }}>
                {sourceText}
              </T>
            )}
          </View>
        ) : null}

        {canConfirm ? (
          <Card hero style={{ gap: Spacing.md, borderRadius: 22 }}>
            <T variant="headline">How did it go?</T>
            <T variant="footnote">
              Enter what WHOOP recorded; the day and the rest of the week re-balance on the real number. Re-importing your WHOOP
              export fills this in for you.
            </T>
            <Row gap={Spacing.md} style={{ alignItems: 'flex-start' }}>
              <Field style={{ flex: 1 }} label="WHOOP calories" placeholder="e.g. 820" value={actualKcal} onChangeText={setActualKcal} keyboardType="number-pad" />
              <Field style={{ flex: 1 }} label="Actual minutes" placeholder={duration} value={actualDuration} onChangeText={setActualDuration} keyboardType="number-pad" />
            </Row>
            {confirmed && estimateOnly && detail ? (
              <T variant="footnote" color={c.text}>
                {detail.added === estimateOnly.added
                  ? 'Exactly what was estimated.'
                  : `${fmt(Math.abs(detail.added - estimateOnly.added))} ${detail.added > estimateOnly.added ? 'more' : 'less'} than the estimate of +${fmt(estimateOnly.added)}.`}
              </T>
            ) : null}
          </Card>
        ) : null}

        {!confirmed ? (
          <Card style={{ gap: Spacing.sm }}>
            <Row style={{ minHeight: 44, justifyContent: 'space-between' }}>
              <T style={{ fontWeight: '600', flex: 1 }}>Use my own burn figure</T>
              <Switch
                value={showOverride}
                onValueChange={(v) => {
                  setShowOverride(v);
                  if (!v) setOverride('');
                }}
                trackColor={{ true: c.switchOn, false: c.track }}
                thumbColor="#FFFFFF"
                accessibilityLabel="Use my own burn figure"
              />
            </Row>
            {showOverride ? (
              <>
                <Field
                  label="Total calories, as WHOOP would show them"
                  placeholder="e.g. 700"
                  value={override}
                  onChangeText={setOverride}
                  keyboardType="number-pad"
                  autoFocus={!override}
                />
                {overrideBase ? (
                  <T variant="footnote" color={c.warn}>
                    Overrides the estimate of {fmt(overrideBase)} kcal.
                  </T>
                ) : null}
              </>
            ) : null}
          </Card>
        ) : null}

        <ErrorText message={invalid ?? error} />
        {id ? (
          <Button title="Delete session" variant="ghost" onPress={remove} style={{ alignSelf: 'center' }} />
        ) : null}
      </Screen>
      <SheetFooter>
        <Button
          title={`${id ? 'Save changes' : 'Add session'}${detail ? ` · +${fmt(detail.added)} kcal` : ''}`}
          accessibilityLabel={id ? 'Save changes' : 'Add session'}
          size="L"
          onPress={save}
          loading={busy}
          disabled={!!invalid}
        />
      </SheetFooter>
    </View>
  );
}

type Choice = { kind: 'whoop'; rate: ActivityRate } | { kind: 'generic'; activity: Activity };

/** One field that opens a searchable, alphabetical list of your WHOOP activities and the generic ones. */
function ActivityPicker({
  whoop,
  selected,
  onPick,
}: {
  whoop: ActivityRate[];
  selected: { kind: 'whoop'; label: string } | { kind: 'generic'; activity: Activity };
  onPick: (c: Choice) => void;
}) {
  const c = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const label = selected.kind === 'whoop' ? selected.label : ACTIVITY_LABELS[selected.activity];

  const all = [
    ...whoop.map((r) => ({
      key: `w:${r.label}`,
      label: r.label,
      meta: r.samples > 0 ? `WHOOP · ${r.samples} session${r.samples === 1 ? '' : 's'}` : 'WHOOP',
      choice: { kind: 'whoop', rate: r } as Choice,
      on: selected.kind === 'whoop' && selected.label.toLowerCase() === r.label.toLowerCase(),
    })),
    ...ACTIVITIES.map((a) => ({
      key: `g:${a}`,
      label: ACTIVITY_LABELS[a],
      meta: 'Typical estimate',
      choice: { kind: 'generic', activity: a } as Choice,
      on: selected.kind === 'generic' && selected.activity === a,
    })),
  ].sort((x, y) => x.label.localeCompare(y.label) || (x.key.startsWith('w:') ? -1 : y.key.startsWith('w:') ? 1 : 0));
  const q = query.trim().toLowerCase();
  const shown = q ? all.filter((o) => o.label.toLowerCase().includes(q)) : all;

  return (
    <View style={{ gap: 6 }}>
      <T variant="footnote">Activity</T>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Activity: ${label}. ${open ? 'Close list' : 'Change'}`}
        onPress={() => {
          setOpen(!open);
          setQuery('');
        }}
        style={{
          height: 52,
          borderRadius: Radius.md,
          backgroundColor: c.raised,
          borderWidth: 2,
          borderColor: open ? c.accentLine : 'transparent',
          paddingHorizontal: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.sm,
        }}>
        <T style={{ flex: 1, fontSize: 17 }} numberOfLines={1}>
          {label}
        </T>
        {selected.kind === 'whoop' ? <StatusPill label="WHOOP" tone="training" /> : null}
        <View style={{ transform: [{ rotate: open ? '-90deg' : '90deg' }] }}>
          <Icon name="chevron-right" size={18} color={c.text2} strokeWidth={2.2} />
        </View>
      </Pressable>
      {open ? (
        <Card style={{ gap: 0, paddingVertical: 6 }}>
          <Row gap={Spacing.sm} style={{ height: 44, backgroundColor: c.raised, borderRadius: 12, paddingHorizontal: 12, marginBottom: 6 }}>
            <Icon name="search" size={16} color={c.text3} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              autoFocus
              placeholder="Search activities"
              placeholderTextColor={c.text3}
              selectionColor={c.accentLine}
              autoCorrect={false}
              accessibilityLabel="Search activities"
              style={{ flex: 1, height: '100%', color: c.text, fontSize: 16 }}
            />
          </Row>
          <ScrollView style={{ maxHeight: 300 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {shown.map((o, i) => (
              <Pressable
                key={o.key}
                accessibilityRole="button"
                accessibilityState={{ selected: o.on }}
                onPress={() => {
                  onPick(o.choice);
                  setOpen(false);
                }}
                style={({ pressed }) => ({
                  minHeight: 48,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: Spacing.sm,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: c.line,
                  opacity: pressed ? 0.6 : 1,
                })}>
                <View style={{ flex: 1 }}>
                  <T style={{ fontWeight: o.on ? '700' : '400' }} color={o.on ? c.accentText : c.text}>
                    {o.label}
                  </T>
                  <T variant="caption" style={{ fontWeight: '400' }} color={o.meta.startsWith('WHOOP') ? c.training : c.text3}>
                    {o.meta}
                  </T>
                </View>
                {o.on ? <Icon name="check" size={16} color={c.accentText} strokeWidth={2.6} /> : null}
              </Pressable>
            ))}
            {shown.length === 0 ? (
              <T variant="footnote" style={{ paddingVertical: Spacing.md }}>
                No match. Pick “Other” for anything not listed.
              </T>
            ) : null}
          </ScrollView>
        </Card>
      ) : null}
    </View>
  );
}
