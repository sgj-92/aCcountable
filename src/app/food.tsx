import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { Button, Card, Divider, ErrorText, Field, fmt, Loading, Row, Screen, Segmented, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  addFood,
  deleteFood,
  getFood,
  MEAL_LABELS,
  MEALS,
  recentFoods,
  updateFood,
  type FoodEntry,
  type Meal,
} from '@/lib/api';
import { formatDay, isValidISODate, today } from '@/lib/dates';
import { kcalFromMacros } from '@/lib/nutrition';

const isMeal = (m: unknown): m is Meal => typeof m === 'string' && (MEALS as string[]).includes(m);

export default function FoodEditor() {
  const c = useTheme();
  const params = useLocalSearchParams<{ id?: string; date?: string; meal?: string }>();
  const id = params.id;

  const [loaded, setLoaded] = useState(!id);
  const [date, setDate] = useState(params.date && isValidISODate(params.date) ? params.date : today());
  const [meal, setMeal] = useState<Meal>(isMeal(params.meal) ? params.meal : 'snack');
  const [name, setName] = useState('');
  const [serving, setServing] = useState('');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [source, setSource] = useState<FoodEntry['source']>('manual');
  const [recent, setRecent] = useState<FoodEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      getFood(id).then(
        (f) => {
          setDate(f.date);
          fill(f);
          setMeal(f.meal);
          setSource(f.source);
          setLoaded(true);
        },
        (e) => setError(e instanceof Error ? e.message : String(e)),
      );
    } else {
      recentFoods().then(setRecent, () => {});
    }
  }, [id]);

  function fill(f: Pick<FoodEntry, 'name' | 'serving' | 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g'>) {
    setName(f.name);
    setServing(f.serving ?? '');
    setKcal(String(f.kcal));
    setProtein(String(f.protein_g));
    setCarbs(String(f.carbs_g));
    setFat(String(f.fat_g));
  }

  const n = (s: string) => (s.trim() === '' ? 0 : Number(s.replace(',', '.')));
  const values = { kcal: n(kcal), p: n(protein), c: n(carbs), f: n(fat) };
  const fromMacros = kcalFromMacros(values.p, values.c, values.f);
  const invalid = !name.trim()
    ? 'Give it a name'
    : kcal.trim() === '' && fromMacros === 0
      ? 'Enter calories or macros'
      : Object.values(values).some((v) => !Number.isFinite(v) || v < 0)
        ? 'Numbers must be zero or more'
        : null;

  async function save() {
    if (invalid) return;
    setBusy(true);
    setError(null);
    const entry = {
      date,
      meal,
      name: name.trim(),
      serving: serving.trim() || null,
      // If only macros were entered, derive kcal from them.
      kcal: Math.round(kcal.trim() === '' ? fromMacros : values.kcal),
      protein_g: values.p,
      carbs_g: values.c,
      fat_g: values.f,
    };
    try {
      if (id) await updateFood(id, entry);
      else await addFood([{ ...entry, source: 'manual', ai_confidence: null }]);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  function remove() {
    if (!id) return;
    Alert.alert('Delete entry?', name, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteFood(id);
            router.back();
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);
  }

  if (!loaded) {
    return <Screen padTop={false}>{error ? <ErrorText message={error} /> : <Loading />}</Screen>;
  }

  return (
    <Screen padTop={false}>
      <Stack.Screen options={{ title: id ? 'Edit food' : `Add food · ${formatDay(date)}` }} />
      <Segmented value={meal} onChange={setMeal} options={MEALS.map((m) => ({ label: MEAL_LABELS[m], value: m }))} />

      <Card style={{ gap: Spacing.md }}>
        <Field label="Food" value={name} onChangeText={setName} placeholder="e.g. Greek yoghurt with honey" />
        <Field label="Serving (optional)" value={serving} onChangeText={setServing} placeholder="e.g. 200 g" />
        <Field label="Calories (kcal)" value={kcal} onChangeText={setKcal} keyboardType="decimal-pad" />
        <Row gap={Spacing.sm}>
          <Field style={{ flex: 1 }} label="Protein g" value={protein} onChangeText={setProtein} keyboardType="decimal-pad" />
          <Field style={{ flex: 1 }} label="Carbs g" value={carbs} onChangeText={setCarbs} keyboardType="decimal-pad" />
          <Field style={{ flex: 1 }} label="Fat g" value={fat} onChangeText={setFat} keyboardType="decimal-pad" />
        </Row>
        {fromMacros > 0 ? (
          <T variant="small">
            Macros add up to {fmt(fromMacros)} kcal
            {kcal.trim() !== '' && Math.abs(fromMacros - values.kcal) > Math.max(30, values.kcal * 0.15)
              ? ', which differs from the calories entered.'
              : '.'}
          </T>
        ) : null}
        {source === 'photo' ? <T variant="small">📷 Estimated from a photo. Adjust if it looks off.</T> : null}
      </Card>

      <ErrorText message={invalid && name ? invalid : error} />
      <Button title={id ? 'Save changes' : 'Add to log'} onPress={save} loading={busy} disabled={!!invalid} />
      {id ? <Button title="Delete entry" variant="ghost" onPress={remove} /> : null}

      {!id && recent.length > 0 ? (
        <Card style={{ gap: 0 }}>
          <T variant="heading" style={{ marginBottom: Spacing.sm }}>
            Recent
          </T>
          {recent.map((f, i) => (
            <View key={f.id}>
              {i > 0 ? <Divider /> : null}
              <Pressable onPress={() => fill(f)} style={{ paddingVertical: Spacing.sm }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <T numberOfLines={1}>{f.name}</T>
                    {f.serving ? <T variant="small">{f.serving}</T> : null}
                  </View>
                  <T color={c.textMuted}>{fmt(f.kcal)}</T>
                </Row>
              </Pressable>
            </View>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
