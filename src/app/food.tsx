import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, View } from 'react-native';

import { FoodSearch } from '@/components/food-search';
import { Icon } from '@/components/icon';
import { MealPicker } from '@/components/meal-picker';
import { PressableScale } from '@/components/pressable-scale';
import { GramsField, Overline, ServingChips, SourceBadge } from '@/components/sheet';
import { Button, Card, ErrorText, Field, fmt, Loading, Num, Row, Screen, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useCountUp } from '@/hooks/use-count-up';
import { useMealSlots } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';
import {
  addFood,
  addFoodEntry,
  deleteFood,
  getFood,
  recentFoods,
  updateFood,
  type FoodEntry,
  type Meal,
  type NewFoodEntry,
} from '@/lib/api';
import { formatDay, isValidISODate, today } from '@/lib/dates';
import { per100gFromEntry, scale, type FoodResult, type Per100g } from '@/lib/foods';
import { SLOT_KEYS } from '@/lib/meals';
import { kcalFromMacros } from '@/lib/nutrition';

const isMeal = (m: unknown): m is Meal => typeof m === 'string' && (SLOT_KEYS as readonly string[]).includes(m);
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
  const params = useLocalSearchParams<{ id?: string; date?: string; meal?: string; diary?: string }>();
  // On a diary-only day calories are optional: a name is enough to keep a record.
  const diaryOnly = params.diary === '1';
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
  const [logged, setLogged] = useState<{ id: string; label: string } | null>(null);
  const [triedSave, setTriedSave] = useState(false);
  const slots = useMealSlots();
  const isToday = date === today();
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
    : !diaryOnly && kcal.trim() === '' && fromMacros === 0
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

  async function quickLog(f: FoodEntry) {
    setError(null);
    try {
      const { id: _id, created_at: _created, ...rest } = f;
      const newId = await addFoodEntry({ ...rest, date, meal });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setLogged({ id: newId, label: `${f.name} · ${fmt(f.kcal)} kcal` });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function undoQuickLog() {
    if (!logged) return;
    const was = logged;
    setLogged(null);
    try {
      await deleteFood(was.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (!loaded) {
    return <Screen padTop={false}>{error ? <ErrorText message={error} /> : <Loading />}</Screen>;
  }

  const mealLabel = slots.find((s) => s.key === meal)?.label ?? 'log';
  const per = basis?.per100g;

  return (
    <Screen padTop={false}>
      <Stack.Screen options={{ title: id ? 'Edit food' : isToday ? 'Add food' : `Add food · ${formatDay(date)}` }} />
      <MealPicker value={meal} onChange={setMeal} />

      {logged ? (
        <Row
          style={{ backgroundColor: c.goodBg, borderRadius: Radius.md, paddingLeft: Spacing.lg, minHeight: 48 }}
          gap={Spacing.sm}>
          <Icon name="check" size={16} color={c.accentText} strokeWidth={2.6} />
          <T style={{ flex: 1, fontSize: 14 }} numberOfLines={1}>
            Logged {logged.label}
          </T>
          <Button title="Undo" variant="ghost" size="S" onPress={undoQuickLog} />
          <Button title="Done" variant="ghost" size="S" onPress={() => router.back()} />
        </Row>
      ) : null}

      {mode === 'search' ? (
        <>
          <FoodSearch onSelect={chooseResult} />
          <Button title="Enter manually" variant="ghost" onPress={() => setMode('manual')} />
          {recent.length > 0 ? (
            <View style={{ gap: Spacing.sm }}>
              <Overline>Recent</Overline>
              <Card style={{ gap: 0, paddingVertical: 4, paddingRight: 4, borderRadius: 22 }}>
                {recent.map((f, i) => (
                  <Row
                    key={f.id}
                    gap={Spacing.sm}
                    style={{ minHeight: 56, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.line }}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${f.name}, ${fmt(f.kcal)} kcal. Choose amount`}
                      onPress={() => chooseRecent(f)}
                      style={{ flex: 1, paddingVertical: 10, gap: 2 }}>
                      <T numberOfLines={1}>{f.name}</T>
                      {f.serving ? <T variant="footnote">{f.serving}</T> : null}
                    </Pressable>
                    <Num size="xs">{fmt(f.kcal)}</Num>
                    <PressableScale
                      accessibilityRole="button"
                      accessibilityLabel={`Log ${f.name} again to ${mealLabel}`}
                      onPress={() => quickLog(f)}
                      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c.raised, alignItems: 'center', justifyContent: 'center' }}>
                        <Icon name="plus" size={16} color={c.accentText} strokeWidth={2.4} />
                      </View>
                    </PressableScale>
                  </Row>
                ))}
              </Card>
            </View>
          ) : null}
        </>
      ) : null}

      {mode === 'weigh' && basis && per ? (
        <>
          {!id ? (
            <Pressable accessibilityRole="button" onPress={() => setMode('search')} hitSlop={8} style={{ alignSelf: 'flex-start' }}>
              <Row gap={2}>
                <Icon name="chevron-left" size={18} color={c.accentText} strokeWidth={2.4} />
                <T color={c.accentText} style={{ fontWeight: '600' }}>
                  Back to search
                </T>
              </Row>
            </Pressable>
          ) : null}
          <View style={{ gap: 4 }}>
            <T variant="title" style={{ fontSize: 20, lineHeight: 25 }}>
              {basis.name}
            </T>
            <Row gap={Spacing.sm} style={{ flexWrap: 'wrap' }}>
              <SourceBadge label={SOURCE_LABEL[basis.source]} />
              <T variant="footnote" style={{ fontVariant: ['tabular-nums'] }}>
                {[basis.brand, basis.detail].filter(Boolean).join(' · ')}
                {basis.brand || basis.detail ? ' · ' : ''}per 100 g: {fmt(per.kcal)} kcal
              </T>
            </Row>
            {basis.incomplete ? (
              <Row gap={4}>
                <Icon name="warn" size={14} color={c.warn} strokeWidth={2.2} />
                <T variant="footnote" color={c.warn} style={{ flex: 1 }}>
                  Some values were missing from the source and are counted as 0.
                </T>
              </Row>
            ) : null}
          </View>
          <GramsField value={grams} onChangeText={setGrams} autoFocus={!id} />
          <ServingChips
            grams={g}
            onPick={(v) => {
              if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
              setGrams(String(v));
            }}
            options={[
              ...basis.servings.map((s) => ({ label: `${s.label} · ${fmt(s.grams)} g`, grams: s.grams })),
              ...(basis.servings.some((s) => s.grams === 100) ? [] : [{ label: '100 g', grams: 100 }]),
            ]}
          />
          {weighed ? <LiveMacros kcal={weighed.kcal} p={weighed.protein_g} c={weighed.carbs_g} f={weighed.fat_g} /> : null}
          <ErrorText message={gramsInvalid ?? error} />
          <Button
            title={id ? 'Save changes' : `Add ${fmt(g)} g to ${mealLabel}`}
            size="L"
            onPress={save}
            loading={busy}
            disabled={!!gramsInvalid}
          />
          <Button title="Edit values directly" variant="ghost" onPress={switchToManual} />
        </>
      ) : null}

      {mode === 'manual' ? (
        <>
          {diaryOnly ? (
            <T variant="footnote">Diary-only day: calories are optional. A name is enough to keep a record.</T>
          ) : null}
          <Field label="Food" value={name} onChangeText={setName} placeholder="e.g. Homemade chilli" />
          <Row gap={Spacing.sm} style={{ alignItems: 'flex-start' }}>
            <Field style={{ flex: 2 }} label="Serving · optional" value={serving} onChangeText={setServing} placeholder="e.g. 1 bowl" />
            <Field style={{ flex: 1 }} label="Weight g" value={manualGrams} onChangeText={setManualGrams} keyboardType="decimal-pad" />
          </Row>
          <Row gap={Spacing.sm} style={{ alignItems: 'flex-start' }}>
            <Field
              style={{ flex: 1 }}
              label="Calories kcal"
              value={kcal}
              onChangeText={setKcal}
              keyboardType="decimal-pad"
              error={triedSave && manualInvalid === 'Enter calories or macros' ? manualInvalid : null}
            />
            <Field style={{ flex: 1 }} label="Protein g" value={protein} onChangeText={setProtein} keyboardType="decimal-pad" />
          </Row>
          <Row gap={Spacing.sm} style={{ alignItems: 'flex-start' }}>
            <Field style={{ flex: 1 }} label="Carbs g" value={carbs} onChangeText={setCarbs} keyboardType="decimal-pad" />
            <Field style={{ flex: 1 }} label="Fat g" value={fat} onChangeText={setFat} keyboardType="decimal-pad" />
          </Row>
          {fromMacros > 0 ? (
            <Row gap={Spacing.sm} style={{ flexWrap: 'wrap' }}>
              <T variant="footnote" style={{ flex: 1 }}>
                Macros add up to {fmt(fromMacros)} kcal
                {kcal.trim() !== '' && Math.abs(fromMacros - values.kcal) > Math.max(30, values.kcal * 0.15)
                  ? ', which differs from the calories entered.'
                  : '.'}
              </T>
              {Math.round(fromMacros) !== Math.round(values.kcal) ? (
                <Button title={`Use ${fmt(fromMacros)}`} variant="secondary" size="S" onPress={() => setKcal(String(Math.round(fromMacros)))} />
              ) : null}
            </Row>
          ) : null}
          {source === 'photo' ? <T variant="footnote">Estimated from a photo. Adjust if it looks off.</T> : null}
          {manualGrams.trim() ? (
            <T variant="footnote">With a weight saved, you can re-weigh this food next time you log it.</T>
          ) : null}
          <ErrorText message={triedSave && manualInvalid && manualInvalid !== 'Enter calories or macros' ? manualInvalid : error} />
          <Button
            title={id ? 'Save changes' : `Add to ${mealLabel}`}
            size="L"
            onPress={() => {
              setTriedSave(true);
              save();
            }}
            loading={busy}
          />
          {!id ? <Button title="Search the food database" variant="ghost" onPress={() => setMode('search')} /> : null}
        </>
      ) : null}

      {id ? <Button title="Delete entry" variant="ghost" onPress={remove} style={{ alignSelf: 'center' }} /> : null}
    </Screen>
  );
}

const SOURCE_LABEL: Record<FoodEntry['source'], string> = {
  usda: 'USDA',
  off: 'Open Food Facts',
  photo: 'Photo estimate',
  manual: 'Your entry',
};

function LiveMacros({ kcal, p, c: carbs, f }: { kcal: number; p: number; c: number; f: number }) {
  const c = useTheme();
  const shown = useCountUp(kcal, 200);
  const dot = (color: string, label: string, v: number) => (
    <Row gap={5}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <T variant="footnote" color={c.text} style={{ fontVariant: ['tabular-nums'] }}>
        {label} {fmt(v)} g
      </T>
    </Row>
  );
  return (
    <Card style={{ borderRadius: Radius.lg, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: Spacing.lg }}>
      <View>
        <Num size="m" style={{ fontSize: 24, lineHeight: 28 }}>
          {fmt(shown)}
        </Num>
        <T variant="caption" style={{ fontWeight: '400' }}>
          kcal
        </T>
      </View>
      <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md }}>
        {dot(c.protein, 'P', p)}
        {dot(c.carbs, 'C', carbs)}
        {dot(c.fat, 'F', f)}
      </View>
    </Card>
  );
}
