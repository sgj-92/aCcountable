import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Switch, TextInput, View } from 'react-native';

import { AppVersion } from '@/components/app-version';
import { Button, Card, Chip, ErrorText, Field, fmt, Loading, Row, Screen, Segmented, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { useProfile } from '@/hooks/use-profile';
import { useTheme, useThemeMode } from '@/hooks/use-theme';
import { getProfile, updateProfile, type Profile } from '@/lib/api';
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
  const form = edited ?? (profile ? toForm(profile) : null);

  if (!profile || !form) {
    return <Screen>{loadError ? <ErrorText message={loadError} /> : <Loading />}</Screen>;
  }

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm({ ...form, [k]: v });
  const validation = validate(form);
  const preview = targetFor({ ...profile, ...toPatch(form) } as Profile, today(), []);

  async function save() {
    if (!profile || !form || validation) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateProfile(profile.id, toPatch(form));
      setForm(toForm(updated));
      await reloadSharedProfile();
      Alert.alert('Saved', 'Your settings have been updated.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <T variant="title">Profile</T>

      {preview ? (
        <Card>
          <T variant="small">Rest-day target</T>
          <T variant="big">{fmt(preview.kcal)} kcal</T>
          <T variant="muted">
            P {preview.proteinG} g · C {preview.carbsG} g · F {preview.fatG} g · BMR {fmt(preview.bmr)}
          </T>
          <T variant="small">Training days add the estimated burn of each session on top, mostly as carbs.</T>
        </Card>
      ) : null}

      <Card style={{ gap: Spacing.md }}>
        <T variant="heading">About you</T>
        <Field label="Name (optional)" value={form.display_name} onChangeText={(v) => set('display_name', v)} />
        <View style={{ gap: Spacing.xs }}>
          <T variant="small">Sex (for the BMR formula)</T>
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
        <Row gap={Spacing.md}>
          <Field
            style={{ flex: 1 }}
            label="Height (cm)"
            value={form.height_cm}
            onChangeText={(v) => set('height_cm', v)}
            keyboardType="decimal-pad"
          />
          <Field
            style={{ flex: 1 }}
            label="Weight (kg)"
            value={form.weight_kg}
            onChangeText={(v) => set('weight_kg', v)}
            keyboardType="decimal-pad"
          />
        </Row>
      </Card>

      <Card style={{ gap: Spacing.md }}>
        <T variant="heading">Daily activity (excluding training)</T>
        {(Object.keys(LIFESTYLE_LABELS) as Lifestyle[]).map((l) => (
          <Chip
            key={l}
            active={form.lifestyle === l}
            onPress={() => set('lifestyle', l)}
            label={`${LIFESTYLE_LABELS[l].title} — ${LIFESTYLE_LABELS[l].detail}`}
          />
        ))}
      </Card>

      <Card style={{ gap: Spacing.md }}>
        <T variant="heading">Goal</T>
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
          <View style={{ gap: Spacing.xs }}>
            <T variant="small">Rate (kg per week)</T>
            <Row style={{ flexWrap: 'wrap' }}>
              {[0.25, 0.5, 0.75, 1].map((r) => (
                <Chip
                  key={r}
                  label={`${r} kg`}
                  active={form.goal_rate_kg_per_week === r}
                  onPress={() => set('goal_rate_kg_per_week', r)}
                />
              ))}
            </Row>
          </View>
        ) : null}
      </Card>

      <Card style={{ gap: Spacing.md }}>
        <T variant="heading">Fine-tuning</T>
        <Row gap={Spacing.md}>
          <Field
            style={{ flex: 1 }}
            label="Protein (g per kg)"
            value={form.protein_g_per_kg}
            onChangeText={(v) => set('protein_g_per_kg', v)}
            keyboardType="decimal-pad"
          />
          <Field
            style={{ flex: 1 }}
            label="Fat (% of base)"
            value={form.fat_pct}
            onChangeText={(v) => set('fat_pct', v)}
            keyboardType="decimal-pad"
          />
        </Row>
        <Field
          label="Training eat-back (%)"
          value={form.training_eat_back_pct}
          onChangeText={(v) => set('training_eat_back_pct', v)}
          keyboardType="number-pad"
          hint="How much of each session's estimated burn to add to that day. Lower it (e.g. 75%) if you find estimates run high."
        />
      </Card>

      <Card style={{ gap: Spacing.md }}>
        <T variant="heading">Meals</T>
        <T variant="small">Pick a preset, then rename any meal. Up to {MAX_MEALS} meals.</T>
        <Row style={{ flexWrap: 'wrap' }}>
          <Chip
            label="Breakfast · Lunch · Dinner"
            active={JSON.stringify(form.meal_slots) === JSON.stringify(CLASSIC_SLOTS)}
            onPress={() => set('meal_slots', CLASSIC_SLOTS)}
          />
          <Chip
            label="Meal 1 · 2 · 3…"
            active={form.meal_slots.every((s, i) => s.label === `Meal ${i + 1}`)}
            onPress={() => set('meal_slots', numberedSlots(form.meal_slots.length))}
          />
        </Row>
        {form.meal_slots.map((slot, i) => (
          <Row key={slot.key} gap={Spacing.sm}>
            <TextInput
              value={slot.label}
              onChangeText={(v) =>
                set(
                  'meal_slots',
                  form.meal_slots.map((s, j) => (j === i ? { ...s, label: v } : s)),
                )
              }
              maxLength={30}
              placeholder={`Meal ${i + 1}`}
              placeholderTextColor={c.textMuted}
              accessibilityLabel={`Name of meal ${i + 1}`}
              style={{
                flex: 1,
                backgroundColor: c.input,
                color: c.text,
                borderRadius: Radius.sm,
                paddingHorizontal: Spacing.md,
                paddingVertical: 10,
                fontSize: 16,
              }}
            />
            {form.meal_slots.length > 1 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${slot.label || `meal ${i + 1}`}`}
                hitSlop={8}
                onPress={() => set('meal_slots', form.meal_slots.filter((_, j) => j !== i))}>
                <T color={c.danger}>Remove</T>
              </Pressable>
            ) : null}
          </Row>
        ))}
        {form.meal_slots.length < MAX_MEALS ? (
          <Button title="+ Add a meal" variant="ghost" onPress={() => set('meal_slots', addSlot(form.meal_slots))} />
        ) : null}
        <T variant="small">Removing a meal doesn’t delete anything logged under it.</T>
      </Card>

      <Card style={{ gap: Spacing.md }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <T variant="heading">Intermittent fasting</T>
            <T variant="small">Shows your eating window and fast on Today.</T>
          </View>
          <Switch
            value={form.fasting}
            onValueChange={(v) => set('fasting', v)}
            trackColor={{ true: c.primary }}
            accessibilityLabel="Intermittent fasting"
          />
        </Row>
        {form.fasting ? (
          <>
            <Row style={{ flexWrap: 'wrap' }}>
              {FASTING_PRESETS.map((p) => (
                <Chip
                  key={p.id}
                  label={p.label}
                  active={parseNum(form.window_hours) === p.windowHours}
                  onPress={() => set('window_hours', String(p.windowHours))}
                />
              ))}
            </Row>
            <Row gap={Spacing.md}>
              <Field
                style={{ flex: 1 }}
                label="Window starts"
                placeholder="12:00"
                value={form.window_start}
                onChangeText={(v) => set('window_start', formatClockInput(v))}
                keyboardType="number-pad"
                maxLength={5}
              />
              <Field
                style={{ flex: 1 }}
                label="Window length (h)"
                value={form.window_hours}
                onChangeText={(v) => set('window_hours', v)}
                keyboardType="decimal-pad"
              />
            </Row>
            {windowEnd(form) ? (
              <T variant="muted">
                Eat {formatClock(parseClock(form.window_start)!)}–{windowEnd(form)}, fast for{' '}
                {fmt(24 - (parseNum(form.window_hours) ?? 0))} h.
              </T>
            ) : null}
          </>
        ) : null}
      </Card>

      <Card style={{ gap: Spacing.sm }}>
        <T variant="heading">Training data</T>
        <T variant="small">
          Import your WHOOP export so session estimates use your own burn rates, and planned sessions get confirmed
          automatically.
        </T>
        <Button title="WHOOP history" variant="secondary" onPress={() => router.push('/whoop-import')} />
        <Button title="Weight & trend" variant="secondary" onPress={() => router.push('/weigh-in')} />
      </Card>

      <Card style={{ gap: Spacing.md }}>
        <T variant="heading">Appearance</T>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { label: 'Dark', value: 'dark' },
            { label: 'Light', value: 'light' },
            { label: 'System', value: 'system' },
          ]}
        />
      </Card>

      <ErrorText message={validation ?? error} />
      <Button title="Save" onPress={save} loading={saving} disabled={!!validation} />

      <View style={{ height: Spacing.lg }} />
      <AppVersion />
      <Button
        title="Sign out"
        variant="ghost"
        onPress={() => supabase.auth.signOut()}
        style={{ alignSelf: 'center' }}
      />
      <T variant="small" style={{ textAlign: 'center' }} color={c.textMuted}>
        Estimates only — not medical advice.
      </T>
    </Screen>
  );
}
