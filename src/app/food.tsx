import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { FoodSearch } from '@/components/food-search';
import { Button, Card, Chip, Divider, ErrorText, Field, fmt, Loading, Row, Screen, Segmented, T } from '@/components/ui';
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
  type NewFoodEntry,
} from '@/lib/api';
import { formatDay, isValidISODate, today } from '@/lib/dates';
import { per100gFromEntry, scale, type FoodResult, type Per100g } from '@/lib/foods';
import { kcalFromMacros } from '@/lib/nutrition';

const isMeal = (m: unknown): m is Meal => typeof m === 'string' && (MEALS as string[]).includes(m);
const parse = (s: string) => (s.trim() === '' ? 0 : Number(s.replace(',', '.')));

/** A food whose values scale with weight. */
interface Basis {
  name: string;
  brand: string | null;
  detail: string | null;
  source: FoodEntry['source'];
  ref: string | null;
  per100g: Per100g;
  servings: { label: string; grams: number }[];
  incomplete: boolean;
}

type Mode = 'search' | 'weigh' | 'manual';

const basisFromResult = (f: FoodResult): Basis => ({
  name: f.name,
  brand: f.brand,
  detail: f.detail,
  source: f.source,
  ref: f.ref,
  per100g: f.per100g,
  servings: f.servings,
  incomplete: f.incomplete,
});

const basisFromEntry = (e: FoodEntry): Basis | null => {
  const per100g = per100gFromEntry(e);
  if (!per100g) return null;
  return {
    name: e.name,
    brand: null,
    detail: null,
    source: e.source,
    ref: e.source_ref,
    per100g,
    servings: [],
    incomplete: false,
  };
};

export default function FoodEditor() {
  const c = useTheme();
  const params = useLocalSearchParams<{ id?: string; date?: string; meal?: string }>();
  const id = params.id;

  const [loaded, setLoaded] = useState(!id);
  const [mode, setMode] = useState<Mode>(id ? 'manual' : 'search');
  const [date, setDate] = useState(params.date && isValidISODate(params.date) ? params.date : today());
  const [meal, setMeal] = useState<Meal>(isMeal(params.meal) ? params.meal : 'snack');
  const [source, setSource] = useState<FoodEntry['source']>('manual');
  const [sourceRef, setSourceRef] = useState<string | null>(null);

  // weigh mode
  const [basis, setBasis] = useState<Basis | null>(null);
  const [grams, setGrams] = useState('100');

  // manual mode
  const [name, setName] = useState('');
  const [serving, setServing] = useState('');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [manualGrams, setManualGrams] = useState('');

  const [recent, setRecent] = useState<FoodEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      getFood(id).then(
        (f) => {
          setDate(f.date);
          setMeal(f.meal);
          setSource(f.source);
          setSourceRef(f.source_ref);
          const b = basisFromEntry(f);
          if (b) {
            setBasis(b);
            setGrams(String(f.grams));
            setMode('weigh');
          } else {
            fillManual(f);
          }
          setLoaded(true);
        },
        (e) => setError(e instanceof Error ? e.message : String(e)),
      );
    } else {
      recentFoods().then(setRecent, () => {});
    }
  }, [id]);

  function fillManual(f: Pick<FoodEntry, 'name' | 'serving' | 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g' | 'grams'>) {
    setName(f.name);
    setServing(f.serving ?? '');
    setKcal(String(f.kcal));
    setProtein(String(f.protein_g));
    setCarbs(String(f.carbs_g));
    setFat(String(f.fat_g));
    setManualGrams(f.grams ? String(f.grams) : '');
  }

  function chooseResult(f: FoodResult) {
    const b = basisFromResult(f);
    setBasis(b);
    setSource(f.source);
    setSourceRef(f.ref);
    setGrams(String(f.servings[0]?.grams ?? 100));
    setMode('weigh');
    setError(null);
  }

  function chooseRecent(f: FoodEntry) {
    setSource(f.source);
    setSourceRef(f.source_ref);
    const b = basisFromEntry(f);
    if (b) {
      setBasis(b);
      setGrams(String(f.grams));
      setMode('weigh');
    } else {
      fillManual(f);
      setMode('manual');
    }
  }

  // ── weigh mode values ──
  const g = parse(grams);
  const gramsInvalid = !Number.isFinite(g) || g <= 0 || g > 10000 ? 'Enter a weight in grams' : null;
  const weighed = basis && !gramsInvalid ? scale(basis.per100g, g) : null;

  function switchToManual() {
    if (basis && weighed) {
      fillManual({
        name: basis.brand ? `${basis.name} · ${basis.brand}` : basis.name,
        serving: `${fmt(g)} g`,
        kcal: weighed.kcal,
        protein_g: weighed.protein_g,
        carbs_g: weighed.carbs_g,
        fat_g: weighed.fat_g,
        grams: g,
      });
    }
    setMode('manual');
  }

  // ── manual mode values ──
  const values = { kcal: parse(kcal), p: parse(protein), c: parse(carbs), f: parse(fat), g: parse(manualGrams) };
  const fromMacros = kcalFromMacros(values.p, values.c, values.f);
  const manualInvalid = !name.trim()
    ? 'Give it a name'
    : kcal.trim() === '' && fromMacros === 0
      ? 'Enter calories or macros'
      : Object.values(values).some((v) => !Number.isFinite(v) || v < 0) || values.g > 10000
        ? 'Numbers must be zero or more'
        : null;

  async function save() {
    let entry: Omit<NewFoodEntry, 'ai_confidence'>;
    if (mode === 'weigh') {
      if (!basis || !weighed) return;
      const fullName = basis.brand ? `${basis.name} · ${basis.brand}` : basis.name;
      entry = {
        date,
        meal,
        name: fullName.slice(0, 200),
        serving: `${fmt(g)} g`,
        ...weighed,
        grams: Math.round(g * 10) / 10,
        source,
        source_ref: sourceRef,
      };
    } else {
      if (manualInvalid) return;
      entry = {
        date,
        meal,
        name: name.trim().slice(0, 200),
        serving: serving.trim() || null,
        // If only macros were entered, derive kcal from them.
        kcal: Math.round(kcal.trim() === '' ? fromMacros : values.kcal),
        protein_g: values.p,
        carbs_g: values.c,
        fat_g: values.f,
        grams: values.g > 0 ? values.g : null,
        // Hand-edited values are no longer the database's numbers.
        source: source === 'photo' ? 'photo' : 'manual',
        source_ref: source === 'photo' ? null : sourceRef,
      };
    }
    setBusy(true);
    setError(null);
    try {
      if (id) await updateFood(id, entry);
      else await addFood([{ ...entry, ai_confidence: null }]);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  function remove() {
    if (!id) return;
    Alert.alert('Delete entry?', basis?.name ?? name, [
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

      {mode === 'search' ? (
        <>
          <FoodSearch onSelect={chooseResult} />
          <Button title="Enter manually" variant="ghost" onPress={() => setMode('manual')} />
          {recent.length > 0 ? (
            <Card style={{ gap: 0 }}>
              <T variant="heading" style={{ marginBottom: Spacing.sm }}>
                Recent
              </T>
              {recent.map((f, i) => (
                <View key={f.id}>
                  {i > 0 ? <Divider /> : null}
                  <Pressable onPress={() => chooseRecent(f)} style={{ paddingVertical: Spacing.sm }}>
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
        </>
      ) : null}

      {mode === 'weigh' && basis ? (
        <>
          <Card style={{ gap: Spacing.md }}>
            <View style={{ gap: 2 }}>
              <T variant="heading">{basis.name}</T>
              {basis.brand || basis.detail ? (
                <T variant="small">{[basis.brand, basis.detail].filter(Boolean).join(' · ')}</T>
              ) : null}
              {basis.incomplete ? (
                <T variant="small" color={c.danger}>
                  Some values were missing from the source and are counted as 0.
                </T>
              ) : null}
            </View>
            <Field
              label="Weight (g)"
              value={grams}
              onChangeText={setGrams}
              keyboardType="decimal-pad"
              selectTextOnFocus
              autoFocus={!id}
            />
            <Row style={{ flexWrap: 'wrap' }}>
              {basis.servings.map((s) => (
                <Chip
                  key={s.label}
                  label={`${s.label} · ${fmt(s.grams)} g`}
                  active={g === s.grams}
                  onPress={() => setGrams(String(s.grams))}
                />
              ))}
              <Chip label="100 g" active={g === 100} onPress={() => setGrams('100')} />
            </Row>
            {weighed ? (
              <View style={{ gap: Spacing.xs }}>
                <T variant="big">{fmt(weighed.kcal)} kcal</T>
                <T variant="muted">
                  P {weighed.protein_g} g · C {weighed.carbs_g} g · F {weighed.fat_g} g
                </T>
                <T variant="small">
                  Per 100 g: {fmt(basis.per100g.kcal)} kcal · P {fmt(basis.per100g.protein_g)} · C{' '}
                  {fmt(basis.per100g.carbs_g)} · F {fmt(basis.per100g.fat_g)}
                </T>
              </View>
            ) : null}
          </Card>
          <ErrorText message={gramsInvalid ?? error} />
          <Button title={id ? 'Save changes' : 'Add to log'} onPress={save} loading={busy} disabled={!!gramsInvalid} />
          <Button title="Edit values directly" variant="ghost" onPress={switchToManual} />
          {!id ? <Button title="Choose a different food" variant="ghost" onPress={() => setMode('search')} /> : null}
        </>
      ) : null}

      {mode === 'manual' ? (
        <>
          <Card style={{ gap: Spacing.md }}>
            <Field label="Food" value={name} onChangeText={setName} placeholder="e.g. Homemade chilli" />
            <Row gap={Spacing.sm}>
              <Field
                style={{ flex: 2 }}
                label="Serving (optional)"
                value={serving}
                onChangeText={setServing}
                placeholder="e.g. 1 bowl"
              />
              <Field
                style={{ flex: 1 }}
                label="Weight g"
                value={manualGrams}
                onChangeText={setManualGrams}
                keyboardType="decimal-pad"
              />
            </Row>
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
            {manualGrams.trim() ? (
              <T variant="small">With a weight saved, you can re-weigh this food next time you log it.</T>
            ) : null}
          </Card>
          <ErrorText message={manualInvalid && name ? manualInvalid : error} />
          <Button title={id ? 'Save changes' : 'Add to log'} onPress={save} loading={busy} disabled={!!manualInvalid} />
          {!id ? <Button title="Search the food database" variant="ghost" onPress={() => setMode('search')} /> : null}
        </>
      ) : null}

      {id ? <Button title="Delete entry" variant="ghost" onPress={remove} /> : null}
    </Screen>
  );
}
