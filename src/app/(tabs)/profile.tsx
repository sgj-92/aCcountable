import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Pressable, Switch, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppVersion } from '@/components/app-version';
import { Icon, type IconName } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { Overline } from '@/components/sheet';
import { Button, Card, Chip, ErrorText, Field, fmt, Loading, Num, Row, Screen, Segmented, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { useCountUp } from '@/hooks/use-count-up';
import { useProfile } from '@/hooks/use-profile';
import { useTheme, useThemeMode } from '@/hooks/use-theme';
import { getProfile, updateProfile, type Profile } from '@/lib/api';
import { ledgerSyncStatus } from '@/lib/ledger-push';
import { dmyToIso, formatDmyInput, isoToDmy, today } from '@/lib/dates';
import { FASTING_PRESETS, formatClock, formatClockInput, parseClock } from '@/lib/fasting';
import { addSlot, CLASSIC_SLOTS, MAX_MEALS, numberedSlots, resolveSlots, type MealSlot } from '@/lib/meals';
import { LIFESTYLE_LABELS, type Goal, type Lifestyle, type Sex } from '@/lib/nutrition';
import { supabase } from '@/lib/supabase';
import { targetFor } from '@/lib/targets';

type Form = {
  display_name: string;
  sex: Sex | null;
  /** DD-MM-YYYY as typed; stored as ISO. */
  birth_date: string;
  height_cm: string;
  weight_kg: string;
  lifestyle: Lifestyle;
  goal: Goal;
  goal_rate_kg_per_week: number;
  protein_g_per_kg: string;
  fat_pct: string;
  training_eat_back_pct: string;
  meal_slots: MealSlot[];
  meal_mode: 'meals' | 'time';
  fasting: boolean;
  /** "HH:MM" as typed */
  window_start: string;
  window_hours: string;
};

const toForm = (p: Profile): Form => ({
  display_name: p.display_name ?? '',
  sex: p.sex,
  birth_date: isoToDmy(p.birth_date),
  height_cm: p.height_cm?.toString() ?? '',
  weight_kg: p.weight_kg?.toString() ?? '',
  lifestyle: p.lifestyle,
  goal: p.goal,
  goal_rate_kg_per_week: p.goal_rate_kg_per_week,
  protein_g_per_kg: p.protein_g_per_kg.toString(),
  fat_pct: p.fat_pct.toString(),
  training_eat_back_pct: p.training_eat_back_pct.toString(),
  meal_slots: resolveSlots(p.meal_slots),
  meal_mode: p.meal_mode,
  fasting: !!p.eating_window_start && !!p.eating_window_end,
  window_start: p.eating_window_start ?? '12:00',
  window_hours: String(windowHours(p.eating_window_start, p.eating_window_end) ?? 8),
});

function windowHours(start: string | null, end: string | null): number | null {
  const s = parseClock(start);
  const e = parseClock(end);
  if (s == null || e == null) return null;
  return Math.round((((e - s + 1440) % 1440 || 1440) / 60) * 10) / 10;
}

/** End of the eating window ("HH:MM"), or null if the inputs aren't valid. */
function windowEnd(f: Pick<Form, 'window_start' | 'window_hours'>): string | null {
  const s = parseClock(f.window_start);
  const h = parseNum(f.window_hours);
  if (s == null || h == null || h <= 0 || h >= 24) return null;
  return formatClock(s + h * 60);
}

const parseNum = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return s.trim() === '' || Number.isNaN(n) ? null : n;
};

function validate(f: Form): string | null {
  if (f.birth_date && !dmyToIso(f.birth_date)) return 'Enter your birth date as DD-MM-YYYY';
  const h = parseNum(f.height_cm);
  if (h != null && (h < 100 || h > 250)) return 'Height must be 100–250 cm';
  const w = parseNum(f.weight_kg);
  if (w != null && (w < 30 || w > 300)) return 'Weight must be 30–300 kg';
  const p = parseNum(f.protein_g_per_kg);
  if (p == null || p < 0.5 || p > 4) return 'Protein must be 0.5–4 g/kg';
  const fat = parseNum(f.fat_pct);
  if (fat == null || fat < 10 || fat > 60) return 'Fat must be 10–60%';
  const e = parseNum(f.training_eat_back_pct);
  if (e == null || e < 0 || e > 150) return 'Eat-back must be 0–150%';
  if (f.meal_slots.some((s) => !s.label.trim())) return 'Give every meal a name';
  if (f.fasting) {
    if (parseClock(f.window_start) == null) return 'Enter when your eating window starts, e.g. 12:00';
    if (!windowEnd(f)) return 'Eating window must be between 1 and 23 hours';
  }
  return null;
}

function toPatch(f: Form): Partial<Omit<Profile, 'id'>> {
  return {
    display_name: f.display_name.trim() || null,
    sex: f.sex,
    birth_date: f.birth_date ? dmyToIso(f.birth_date) : null,
    height_cm: parseNum(f.height_cm),
    weight_kg: parseNum(f.weight_kg),
    lifestyle: f.lifestyle,
    goal: f.goal,
    goal_rate_kg_per_week: f.goal_rate_kg_per_week,
    protein_g_per_kg: parseNum(f.protein_g_per_kg) ?? 1.8,
    fat_pct: parseNum(f.fat_pct) ?? 25,
    training_eat_back_pct: Math.round(parseNum(f.training_eat_back_pct) ?? 100),
    meal_slots: f.meal_slots.map((s) => ({ key: s.key, label: s.label.trim().slice(0, 30) })),
    meal_mode: f.meal_mode,
    eating_window_start: f.fasting ? formatClock(parseClock(f.window_start) ?? 720) : null,
    eating_window_end: f.fasting ? windowEnd(f) : null,
  };
}

export default function ProfileScreen() {
  const c = useTheme();
  const { mode, setMode } = useThemeMode();
  const { reload: reloadSharedProfile } = useProfile();
  const { data: profile, error: loadError } = useAsync(getProfile, 'profile');
  // null = untouched, so the form shows the loaded profile until the first edit.
  const [edited, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const { data: ledgerOn } = useAsync(ledgerSyncStatus, 'ledger-status');
  const insets = useSafeAreaInsets();
  const form = edited ?? (profile ? toForm(profile) : null);

  if (!profile || !form) {
    return <Screen>{loadError ? <ErrorText message={loadError} /> : <Loading />}</Screen>;
  }

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm({ ...form, [k]: v });
  const validation = validate(form);
  const preview = targetFor({ ...profile, ...toPatch(form) } as Profile, today(), []);

  const dirty = edited != null && JSON.stringify(edited) !== JSON.stringify(toForm(profile));

  async function save() {
    if (!profile || !form || validation) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateProfile(profile.id, toPatch(form));
      setForm(toForm(updated));
      await reloadSharedProfile();
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const applyPreset = (slots: MealSlot[], name: string) =>
    Alert.alert(`Use ${name}?`, 'This renames all your meals. Anything logged keeps its place.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Rename', onPress: () => set('meal_slots', slots) },
    ]);

  const signOut = () =>
    Alert.alert('Sign out?', 'Your data stays in your account.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Screen padBottom={dirty ? 200 : undefined}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end', paddingBottom: 2 }}>
          <T variant="largeTitle">Profile</T>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={dirty ? 'Save changes' : 'Saved'}
            accessibilityState={{ disabled: !dirty || !!validation }}
            disabled={!dirty || !!validation || saving}
            onPress={save}
            hitSlop={10}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 8 }}>
            {dirty ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.accentText }} /> : null}
            <T style={{ fontSize: 17, fontWeight: '600' }} color={dirty && !validation ? c.accentText : c.text3}>
              {saving ? 'Saving…' : dirty ? 'Save' : savedAt ? 'Saved' : 'Save'}
            </T>
          </Pressable>
        </Row>

        {preview ? (
          <Card hero style={{ paddingVertical: 18, paddingHorizontal: Spacing.xl, gap: 4 }}>
            <Overline>Rest-day target</Overline>
            <Row gap={6} style={{ alignItems: 'baseline', paddingHorizontal: 4 }}>
              <PreviewKcal kcal={preview.kcal} />
              <T style={{ fontSize: 17, fontWeight: '600' }} color={c.text2}>
                kcal
              </T>
            </Row>
            <T variant="footnote" style={{ fontVariant: ['tabular-nums'], paddingHorizontal: 4 }}>
              P {preview.proteinG} g · C {preview.carbsG} g · F {preview.fatG} g · BMR {fmt(preview.bmr)}
            </T>
            <T variant="footnote" style={{ paddingHorizontal: 4 }}>
              Training days add the estimated burn of each session on top, mostly as carbs.
            </T>
            {profile.maintenance_adjust_kcal ? (
              <T variant="footnote" color={c.text} style={{ paddingHorizontal: 4 }}>
                Includes a {profile.maintenance_adjust_kcal > 0 ? '+' : '−'}
                {fmt(Math.abs(profile.maintenance_adjust_kcal))} kcal correction from your weigh-ins (change it on Week).
              </T>
            ) : null}
          </Card>
        ) : null}

        <Overline>About you</Overline>
        <Card style={{ gap: Spacing.md }}>
          <Field label="Name · optional" value={form.display_name} onChangeText={(v) => set('display_name', v)} />
          <View style={{ gap: 6 }}>
            <T variant="footnote">Sex (for the BMR formula)</T>
            <Segmented
              value={form.sex ?? ('' as Sex)}
              onChange={(v) => set('sex', v)}
              options={[
                { label: 'Male', value: 'male' },
                { label: 'Female', value: 'female' },
              ]}
            />
          </View>
          <Field
            label="Birth date"
            placeholder="DD-MM-YYYY"
            value={form.birth_date}
            onChangeText={(v) => set('birth_date', formatDmyInput(v))}
            keyboardType="number-pad"
            maxLength={10}
          />
          <Row gap={Spacing.md} style={{ alignItems: 'flex-start' }}>
            <Field style={{ flex: 1 }} label="Height cm" value={form.height_cm} onChangeText={(v) => set('height_cm', v)} keyboardType="decimal-pad" />
            <Field style={{ flex: 1 }} label="Weight kg" value={form.weight_kg} onChangeText={(v) => set('weight_kg', v)} keyboardType="decimal-pad" />
          </Row>
        </Card>

        <Overline>Daily activity, excluding training</Overline>
        <View accessibilityRole="radiogroup" style={{ gap: 6 }}>
          {(Object.keys(LIFESTYLE_LABELS) as Lifestyle[]).map((l) => {
            const on = form.lifestyle === l;
            return (
              <PressableScale
                key={l}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                onPress={() => set('lifestyle', l)}
                style={({ pressed }) => ({
                  minHeight: 52,
                  borderRadius: Radius.md,
                  paddingVertical: 7,
                  paddingHorizontal: 14,
                  justifyContent: 'center',
                  backgroundColor: on ? c.accent : pressed ? c.pressed : c.surface,
                })}>
                <T style={{ fontWeight: '600' }} color={on ? c.onAccent : c.text}>
                  {LIFESTYLE_LABELS[l].title}
                </T>
                <T style={{ fontSize: 13, lineHeight: 17 }} color={on ? c.onAccent : c.text2}>
                  {LIFESTYLE_LABELS[l].detail}
                </T>
              </PressableScale>
            );
          })}
        </View>

        <Overline>Goal</Overline>
        <Card style={{ gap: Spacing.md }}>
          <Segmented
            value={form.goal}
            onChange={(v) => set('goal', v)}
            options={[
              { label: 'Lose', value: 'lose' },
              { label: 'Maintain', value: 'maintain' },
              { label: 'Gain', value: 'gain' },
            ]}
          />
          {form.goal !== 'maintain' ? (
            <View style={{ gap: 6 }}>
              <T variant="footnote">Rate per week</T>
              <Row style={{ flexWrap: 'wrap' }}>
                {[0.25, 0.5, 0.75, 1].map((r) => (
                  <Chip key={r} label={`${r} kg`} active={form.goal_rate_kg_per_week === r} onPress={() => set('goal_rate_kg_per_week', r)} />
                ))}
              </Row>
            </View>
          ) : null}
        </Card>

        <Overline>Fine-tuning</Overline>
        <Card style={{ gap: Spacing.sm }}>
          <Row gap={Spacing.sm} style={{ alignItems: 'flex-start' }}>
            <Field style={{ flex: 1 }} label="Protein g/kg" value={form.protein_g_per_kg} onChangeText={(v) => set('protein_g_per_kg', v)} keyboardType="decimal-pad" />
            <Field style={{ flex: 1 }} label="Fat % of base" value={form.fat_pct} onChangeText={(v) => set('fat_pct', v)} keyboardType="decimal-pad" />
            <Field style={{ flex: 1 }} label="Eat-back %" value={form.training_eat_back_pct} onChangeText={(v) => set('training_eat_back_pct', v)} keyboardType="number-pad" />
          </Row>
          <T variant="footnote">
            Eat-back is how much of each session’s estimated burn becomes fuel. A quarter of a big session’s fuel moves to the
            next day for recovery, each day’s carbs are capped by its training (anything over is shared across the rest of the
            week), and your weigh-ins correct the base once a week, so you’re fuelled and still losing at your goal rate.
          </T>
        </Card>

        <Overline>Meals</Overline>
        <Card style={{ gap: Spacing.md }}>
          <Segmented
            value={form.meal_mode}
            onChange={(v) => set('meal_mode', v)}
            options={[
              { label: 'Meals', value: 'meals' },
              { label: 'Just times', value: 'time' },
            ]}
          />
          {form.meal_mode === 'time' ? (
            <T variant="footnote">
              Today shows food by the time you ate it, with no meal names. Planned meals still use the list below (and so
              does Ledger).
            </T>
          ) : null}
          <Row style={{ flexWrap: 'wrap' }}>
            <Chip
              label="Breakfast · Lunch · Dinner"
              active={JSON.stringify(form.meal_slots) === JSON.stringify(CLASSIC_SLOTS)}
              onPress={() => applyPreset(CLASSIC_SLOTS, 'Breakfast, Lunch, Dinner')}
            />
            <Chip
              label="Meal 1 · 2 · 3…"
              active={form.meal_slots.every((sl, i) => sl.label === `Meal ${i + 1}`)}
              onPress={() => applyPreset(numberedSlots(form.meal_slots.length), 'numbered meals')}
            />
          </Row>
          {form.meal_slots.map((slot, i) => (
            <Animated.View key={slot.key} entering={FadeIn.duration(180)} exiting={FadeOut.duration(160)} layout={LinearTransition}>
              <Row gap={Spacing.sm}>
                <TextInput
                  value={slot.label}
                  onChangeText={(v) => set('meal_slots', form.meal_slots.map((sl, j) => (j === i ? { ...sl, label: v } : sl)))}
                  maxLength={30}
                  placeholder={`Meal ${i + 1}`}
                  placeholderTextColor={c.text3}
                  selectionColor={c.accentLine}
                  accessibilityLabel={`Name of meal ${i + 1}`}
                  style={{ flex: 1, height: 44, backgroundColor: c.raised, color: c.text, borderRadius: 12, paddingHorizontal: 14, fontSize: 17 }}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${slot.label || `meal ${i + 1}`}`}
                  disabled={form.meal_slots.length <= 1}
                  onPress={() => set('meal_slots', form.meal_slots.filter((_, j) => j !== i))}
                  style={{ height: 44, justifyContent: 'center', paddingHorizontal: 4, opacity: form.meal_slots.length <= 1 ? 0.4 : 1 }}>
                  <T color={c.alert} style={{ fontWeight: '600' }}>
                    Remove
                  </T>
                </Pressable>
              </Row>
            </Animated.View>
          ))}
          {form.meal_slots.length < MAX_MEALS ? (
            <Button title="+ Add meal" variant="ghost" onPress={() => set('meal_slots', addSlot(form.meal_slots))} style={{ alignSelf: 'flex-start' }} />
          ) : null}
          <T variant="footnote">Up to {MAX_MEALS} meals. Removing one doesn’t delete anything logged under it.</T>
        </Card>

        <Overline>Intermittent fasting</Overline>
        <Card style={{ gap: Spacing.md }}>
          <Row style={{ justifyContent: 'space-between', minHeight: 44 }}>
            <View style={{ flex: 1 }}>
              <T style={{ fontWeight: '600' }}>Eating window</T>
              <T variant="footnote">Shows your window and fast on Today.</T>
            </View>
            <Switch
              value={form.fasting}
              onValueChange={(v) => set('fasting', v)}
              trackColor={{ true: c.switchOn, false: c.track }}
              thumbColor="#FFFFFF"
              accessibilityLabel="Intermittent fasting"
            />
          </Row>
          {form.fasting ? (
            <Animated.View entering={FadeIn.duration(220)} style={{ gap: Spacing.md }}>
              <Row style={{ flexWrap: 'wrap' }}>
                {FASTING_PRESETS.map((pr) => (
                  <Chip key={pr.id} label={pr.label} active={parseNum(form.window_hours) === pr.windowHours} onPress={() => set('window_hours', String(pr.windowHours))} />
                ))}
              </Row>
              <Row gap={Spacing.md} style={{ alignItems: 'flex-start' }}>
                <Field
                  style={{ flex: 1 }}
                  label="Window opens"
                  placeholder="12:00"
                  value={form.window_start}
                  onChangeText={(v) => set('window_start', formatClockInput(v))}
                  keyboardType="number-pad"
                  maxLength={5}
                />
                <Field style={{ flex: 1 }} label="Length h" value={form.window_hours} onChangeText={(v) => set('window_hours', v)} keyboardType="decimal-pad" />
              </Row>
              {windowEnd(form) ? (
                <T variant="footnote" color={c.text}>
                  Eat {formatClock(parseClock(form.window_start)!)}–{windowEnd(form)}, fast for {fmt(24 - (parseNum(form.window_hours) ?? 0))} h.
                </T>
              ) : null}
            </Animated.View>
          ) : null}
        </Card>

        <Overline>Food and training data</Overline>
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          <NavRow icon="clock" title="Day types" meta="Agreed days: targets, training and meals" onPress={() => router.push('/day-types')} />
          <NavRow icon="file" title="Pantry" meta="Your foods and usual portions" onPress={() => router.push('/pantry')} divider />
          <NavRow icon="stopwatch" title="WHOOP history" meta="Your own burn rates per activity" onPress={() => router.push('/whoop-import')} divider />
          <NavRow icon="scale" title="Weight & trend" meta="Weigh-ins and the smoothed trend" onPress={() => router.push('/weigh-in')} divider />
          <Row gap={Spacing.md} style={{ minHeight: 56, borderTopWidth: 1, borderTopColor: c.line }}>
            <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: c.raised, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="check" size={16} color={ledgerOn ? c.good : c.text3} strokeWidth={2.4} />
            </View>
            <View style={{ flex: 1 }}>
              <T style={{ fontWeight: '600' }}>Ledger sync</T>
              <T variant="footnote">
                {ledgerOn == null
                  ? 'Checking…'
                  : ledgerOn
                    ? 'On: training, meals, nutrition and weight sync with Ledger'
                    : 'Not set up yet'}
              </T>
            </View>
          </Row>
        </Card>

        <Overline>App</Overline>
        <Card style={{ gap: Spacing.md }}>
          <View style={{ gap: 6 }}>
            <T variant="footnote">Appearance</T>
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { label: 'Dark', value: 'dark' },
                { label: 'Light', value: 'light' },
                { label: 'System', value: 'system' },
              ]}
            />
          </View>
          <AppVersion />
        </Card>

        <ErrorText message={dirty ? validation ?? error : error} />

        <Button title="Sign out" variant="ghost" onPress={signOut} style={{ alignSelf: 'center', marginTop: Spacing.xxl }} />
        <T variant="footnote" style={{ textAlign: 'center' }} color={c.text3}>
          Estimates only — not medical advice.
        </T>
      </Screen>
      {dirty ? (
        <View
          style={{
            position: 'absolute',
            left: Spacing.lg,
            right: Spacing.lg,
            bottom: insets.bottom + 62 + 12,
          }}>
          <Button title="Save changes" size="L" onPress={save} loading={saving} disabled={!!validation} style={{ boxShadow: c.e2 }} />
        </View>
      ) : null}
    </View>
  );
}

function PreviewKcal({ kcal }: { kcal: number }) {
  return (
    <Num size="hero" style={{ fontSize: 48, lineHeight: 52 }}>
      {fmt(useCountUp(kcal))}
    </Num>
  );
}

function NavRow({
  icon,
  title,
  meta,
  onPress,
  divider,
}: {
  icon: IconName;
  title: string;
  meta: string;
  onPress: () => void;
  divider?: boolean;
}) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        borderTopWidth: divider ? 1 : 0,
        borderTopColor: c.line,
        opacity: pressed ? 0.7 : 1,
      })}>
      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: c.raised, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={18} color={c.text2} />
      </View>
      <View style={{ flex: 1 }}>
        <T style={{ fontWeight: '600' }}>{title}</T>
        <T variant="footnote">{meta}</T>
      </View>
      <Icon name="chevron-right" size={16} color={c.text3} strokeWidth={2.2} />
    </Pressable>
  );
}
