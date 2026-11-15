import { useState } from 'react';
import { Alert, View } from 'react-native';

import { Button, Card, Chip, ErrorText, Field, fmt, Loading, Row, Screen, Segmented, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { useTheme } from '@/hooks/use-theme';
import { getProfile, updateProfile, type Profile } from '@/lib/api';
import { dmyToIso, formatDmyInput, isoToDmy, today } from '@/lib/dates';
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
});

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
  };
}

export default function ProfileScreen() {
  const c = useTheme();
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
      Alert.alert('Saved', 'Your targets have been updated.');
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

      <ErrorText message={validation ?? error} />
      <Button title="Save" onPress={save} loading={saving} disabled={!!validation} />

      <View style={{ height: Spacing.lg }} />
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
