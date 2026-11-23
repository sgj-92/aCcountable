import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, TextInput, View } from 'react-native';

import { Icon } from '@/components/icon';
import { showMenu } from '@/components/menu';
import { FOOTER_SPACE, Overline, SheetFooter } from '@/components/sheet';
import { Button, Card, ErrorText, Field, fmt, IconButton, Loading, Row, Screen, Segmented, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useMealSlots } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';
import { listWhoopWorkouts, type Meal } from '@/lib/api';
import {
  deleteDayType,
  getDayType,
  mealTotals,
  saveDayType,
  type DayTypeFood,
  type DayTypeSession,
} from '@/lib/day-types';
import { ACTIVITY_LABELS, type Activity, type Intensity } from '@/lib/nutrition';
import { listPantry, type PantryItem } from '@/lib/pantry';
import { amountLabel } from '@/lib/plans';
import { ratesFromRows, type ActivityRate } from '@/lib/whoop';

const num = (s: string) => (s.trim() === '' ? NaN : Number(s.replace(',', '.')));
const ACTIVITIES = Object.keys(ACTIVITY_LABELS) as Activity[];

/** Create or edit a day type: name, targets, assumed training and meals from the pantry. */
export default function DayTypeEditor() {
  const c = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const slots = useMealSlots();
  const [loaded, setLoaded] = useState(!id);
  const [name, setName] = useState('');
  const [position, setPosition] = useState(0);
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [sessions, setSessions] = useState<DayTypeSession[]>([]);
  const [meals, setMeals] = useState<DayTypeFood[]>([]);
  const [pantry, setPantry] = useState<PantryItem[]>([]);
  const [whoop, setWhoop] = useState<ActivityRate[]>([]);
  const [addingTo, setAddingTo] = useState<Meal | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listPantry().then(setPantry, () => {});
    listWhoopWorkouts().then((w) => setWhoop(ratesFromRows(w).byName), () => {});
    if (id) {
      getDayType(id).then(
        (d) => {
          setName(d.name);
          setPosition(d.position);
          setKcal(String(d.kcal));
          setProtein(String(d.protein_g));
          setCarbs(String(d.carbs_g));
          setFat(String(d.fat_g));
          setSessions(d.sessions);
          setMeals(d.meals);
          setLoaded(true);
        },
        (e) => setError(e instanceof Error ? e.message : String(e)),
      );
    }
  }, [id]);

  if (!loaded) return <Screen padTop={false}>{error ? <ErrorText message={error} /> : <Loading />}</Screen>;

  const t = { kcal: num(kcal), p: num(protein), c: num(carbs), f: num(fat) };
  const totals = mealTotals({ meals });
  const invalid = !name.trim()
    ? 'Give it a name'
    : !Number.isFinite(t.kcal) || t.kcal < 800 || t.kcal > 8000
      ? 'Calories must be 800–8,000'
      : [t.p, t.c, t.f].some((v) => !Number.isFinite(v) || v < 0)
        ? 'Enter protein, carbs and fat in grams'
        : null;

  async function save() {
    if (invalid) return;
    setBusy(true);
    setError(null);
    try {
      await saveDayType(
        {
          name: name.trim().slice(0, 40),
          position,
          kcal: Math.round(t.kcal),
          protein_g: Math.round(t.p),
          carbs_g: Math.round(t.c),
          fat_g: Math.round(t.f),
          sessions,
          meals,
          notes: null,
        },
        id,
      );
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const remove = () =>
    Alert.alert('Delete this day type?', 'Days that used it go back to the app’s own targets. Logged food stays.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDayType(id!);
            router.back();
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);

  const useMealTotals = () => {
    setKcal(String(Math.round(totals.kcal)));
    setProtein(String(Math.round(totals.protein_g)));
    setCarbs(String(Math.round(totals.carbs_g)));
    setFat(String(Math.round(totals.fat_g)));
  };

  const pickActivity = (i: number) =>
    showMenu(
      [
        ...whoop.map((r) => ({
          label: `${r.label} (WHOOP)`,
          onPress: () => setSessions(sessions.map((s, j) => (j === i ? { ...s, activity: r.activity, whoop_activity: r.label } : s))),
        })),
        ...ACTIVITIES.map((a) => ({
          label: ACTIVITY_LABELS[a],
          onPress: () => setSessions(sessions.map((s, j) => (j === i ? { ...s, activity: a, whoop_activity: null } : s))),
        })),
      ],
      'Activity',
    );

  const addFood = (meal: Meal, p: PantryItem) => {
    setMeals([
      ...meals,
      {
        meal,
        name: p.name,
        grams: p.portion_g,
        kcal_100g: p.kcal_100g,
        protein_100g: p.protein_100g,
        carbs_100g: p.carbs_100g,
        fat_100g: p.fat_100g,
        unit_name: p.unit_name,
        unit_g: p.unit_g,
        pantry_id: p.id,
        source: p.source,
        source_ref: p.source_ref,
      },
    ]);
    setAddingTo(null);
    setQuery('');
  };

  const off = Number.isFinite(t.kcal) ? Math.round(totals.kcal - t.kcal) : 0;
  const q = query.trim().toLowerCase();

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: id ? 'Edit day type' : 'New day type' }} />
      <Screen padTop={false} padBottom={FOOTER_SPACE + Spacing.xl}>
        <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Padel day" maxLength={40} />

        <Overline>Agreed targets</Overline>
        <Card style={{ gap: Spacing.md }}>
          <Row gap={Spacing.sm} style={{ alignItems: 'flex-start' }}>
            <Field style={{ flex: 1.3 }} label="kcal" value={kcal} onChangeText={setKcal} keyboardType="number-pad" />
            <Field style={{ flex: 1 }} label="Protein g" value={protein} onChangeText={setProtein} keyboardType="number-pad" />
            <Field style={{ flex: 1 }} label="Carbs g" value={carbs} onChangeText={setCarbs} keyboardType="number-pad" />
            <Field style={{ flex: 1 }} label="Fat g" value={fat} onChangeText={setFat} keyboardType="number-pad" />
          </Row>
          {meals.length ? (
            <Row gap={Spacing.sm} style={{ flexWrap: 'wrap' }}>
              <T variant="footnote" style={{ flex: 1, fontVariant: ['tabular-nums'] }} color={Math.abs(off) > 150 ? c.warn : c.text2}>
                Meals add up to {fmt(totals.kcal)} kcal · P {fmt(totals.protein_g)} · C {fmt(totals.carbs_g)} · F {fmt(totals.fat_g)}
              </T>
              <Button title="Use these" variant="secondary" size="S" onPress={useMealTotals} />
            </Row>
          ) : null}
          <T variant="footnote">
            On the day, the target only moves for the week balance or if your training differs from what’s below.
          </T>
        </Card>

        <Overline>Training this day assumes</Overline>
        <Card style={{ gap: Spacing.md }}>
          {sessions.length === 0 ? <T variant="footnote">None: a rest day.</T> : null}
          {sessions.map((s, i) => (
            <View key={i} style={{ gap: Spacing.sm, borderTopWidth: i ? 1 : 0, borderTopColor: c.line, paddingTop: i ? Spacing.md : 0 }}>
              <Row gap={Spacing.sm}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => pickActivity(i)}
                  style={{ flex: 1, height: 44, borderRadius: Radius.md, backgroundColor: c.raised, paddingHorizontal: 14, justifyContent: 'center' }}>
                  <T numberOfLines={1}>{s.whoop_activity ?? ACTIVITY_LABELS[s.activity]} ▾</T>
                </Pressable>
                <TextInput
                  value={String(s.duration_min)}
                  onChangeText={(v) => setSessions(sessions.map((x, j) => (j === i ? { ...x, duration_min: Math.max(0, Math.round(num(v) || 0)) } : x)))}
                  keyboardType="number-pad"
                  accessibilityLabel="Minutes"
                  selectionColor={c.accentLine}
                  style={{ width: 64, height: 44, borderRadius: Radius.md, backgroundColor: c.raised, color: c.text, textAlign: 'center', fontFamily: 'Archivo_700Bold', fontSize: 16 }}
                />
                <T variant="footnote">min</T>
                <IconButton glyph="✕" label="Remove session" size={32} onPress={() => setSessions(sessions.filter((_, j) => j !== i))} />
              </Row>
              <Segmented<Intensity>
                value={s.intensity}
                onChange={(v) => setSessions(sessions.map((x, j) => (j === i ? { ...x, intensity: v } : x)))}
                options={[
                  { label: 'Easy', value: 'easy' },
                  { label: 'Moderate', value: 'moderate' },
                  { label: 'Hard', value: 'hard' },
                ]}
              />
            </View>
          ))}
          <Button
            title="+ Add training"
            variant="ghost"
            size="S"
            onPress={() => setSessions([...sessions, { activity: whoop[0]?.activity ?? 'run', whoop_activity: whoop[0]?.label ?? null, duration_min: whoop[0]?.typicalMin ?? 60, intensity: 'moderate' }])}
            style={{ alignSelf: 'flex-start' }}
          />
        </Card>

        <Overline>Meals</Overline>
        {slots.map((slot) => {
          const rows = meals.map((m, i) => ({ m, i })).filter(({ m }) => m.meal === slot.key);
          return (
            <Card key={slot.key} style={{ gap: 0, paddingVertical: 4, paddingRight: Spacing.sm }}>
              <Row style={{ minHeight: 44, justifyContent: 'space-between' }}>
                <T style={{ fontWeight: '600' }}>{slot.label}</T>
                <Button title="+ Add food" variant="ghost" size="S" onPress={() => setAddingTo(addingTo === slot.key ? null : slot.key)} />
              </Row>
              {rows.map(({ m, i }) => {
                const step = m.unit_g ? m.unit_g / 2 : Math.max(5, Math.round(m.grams / 4 / 5) * 5);
                return (
                  <Row key={i} gap={Spacing.sm} style={{ minHeight: 56, borderTopWidth: 1, borderTopColor: c.line }}>
                    <View style={{ flex: 1 }}>
                      <T numberOfLines={1}>{m.name}</T>
                      <T variant="footnote" style={{ fontVariant: ['tabular-nums'] }}>
                        {amountLabel(m, m.grams)} · {fmt((m.kcal_100g * m.grams) / 100)} kcal
                      </T>
                    </View>
                    <IconButton glyph="−" label={`Less ${m.name}`} size={32} disabled={m.grams - step <= 0} onPress={() => setMeals(meals.map((x, j) => (j === i ? { ...x, grams: x.grams - step } : x)))} />
                    <IconButton glyph="+" label={`More ${m.name}`} size={32} onPress={() => setMeals(meals.map((x, j) => (j === i ? { ...x, grams: x.grams + step } : x)))} />
                    <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${m.name}`} onPress={() => setMeals(meals.filter((_, j) => j !== i))} style={{ width: 32, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="close" size={16} color={c.text3} strokeWidth={2.4} />
                    </Pressable>
                  </Row>
                );
              })}
              {addingTo === slot.key ? (
                <View style={{ gap: Spacing.sm, paddingVertical: Spacing.sm, borderTopWidth: 1, borderTopColor: c.line }}>
                  {pantry.length === 0 ? (
                    <T variant="footnote">Your pantry is empty. Add foods in Profile → Pantry first.</T>
                  ) : (
                    <>
                      <TextInput
                        value={query}
                        onChangeText={setQuery}
                        autoFocus
                        placeholder="Search your pantry"
                        placeholderTextColor={c.text3}
                        selectionColor={c.accentLine}
                        style={{ height: 40, borderRadius: 12, backgroundColor: c.raised, color: c.text, paddingHorizontal: 12, fontSize: 16 }}
                      />
                      {pantry
                        .filter((p) => !q || p.name.toLowerCase().includes(q))
                        .sort((a, b) => Number(b.meals.includes(slot.key)) - Number(a.meals.includes(slot.key)))
                        .slice(0, 12)
                        .map((p) => (
                          <Pressable
                            key={p.id}
                            accessibilityRole="button"
                            onPress={() => addFood(slot.key, p)}
                            style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
                            <T numberOfLines={1}>{p.name}</T>
                            <T variant="footnote">Usually {amountLabel(p, p.portion_g)}</T>
                          </Pressable>
                        ))}
                    </>
                  )}
                </View>
              ) : null}
            </Card>
          );
        })}

        <ErrorText message={invalid && name ? invalid : error} />
        {id ? <Button title="Delete day type" variant="ghost" onPress={remove} style={{ alignSelf: 'center' }} /> : null}
      </Screen>
      <SheetFooter>
        <Button title="Save day type" size="L" onPress={save} loading={busy} disabled={!!invalid} />
      </SheetFooter>
    </View>
  );
}
