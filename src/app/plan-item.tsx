import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, Switch, Text, TextInput, View } from 'react-native';

import { FoodSearch } from '@/components/food-search';
import { Icon } from '@/components/icon';
import { MealPicker } from '@/components/meal-picker';
import { GramsField, Overline, SourceBadge } from '@/components/sheet';
import { Button, Card, ErrorText, Field, fmt, Loading, Num, Row, Screen, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useMealSlots } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';
import { deleteFood, type Meal } from '@/lib/api';
import type { FoodResult } from '@/lib/foods';
import { macrosFor } from '@/lib/planner';
import {
  amountLabel,
  deletePlanItems,
  getPlanItem,
  logPlanItem,
  per100gOf,
  updatePlanItem,
  type PlanItem,
} from '@/lib/plans';

const num = (s: string) => (s.trim() === '' ? NaN : Number(s.replace(',', '.')));
const str = (n: number | null | undefined) => (n == null ? '' : String(n));

export default function PlanItemScreen() {
  const c = useTheme();
  const params = useLocalSearchParams<{ id: string; planned?: string }>();
  const [item, setItem] = useState<PlanItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // log
  const [ate, setAte] = useState(params.planned ? String(Math.round(Number(params.planned))) : '');
  // edit
  const [name, setName] = useState('');
  const [meal, setMeal] = useState<Meal>('snack');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [minG, setMinG] = useState('');
  const [maxG, setMaxG] = useState('');
  const [fixed, setFixed] = useState(false);
  const [fixedG, setFixedG] = useState('');
  const [source, setSource] = useState<PlanItem['source']>('ai');
  const [sourceRef, setSourceRef] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const slots = useMealSlots();

  useEffect(() => {
    getPlanItem(params.id).then(
      (i) => {
        setItem(i);
        setName(i.name);
        setMeal(i.meal);
        setKcal(str(i.kcal_100g));
        setProtein(str(i.protein_100g));
        setCarbs(str(i.carbs_100g));
        setFat(str(i.fat_100g));
        setMinG(str(i.min_g));
        setMaxG(str(i.max_g));
        setFixed(i.fixed_g != null);
        setFixedG(str(i.fixed_g ?? (params.planned ? Math.round(Number(params.planned)) : i.typical_g)));
        setSource(i.source);
        setSourceRef(i.source_ref);
      },
      (e) => setError(e instanceof Error ? e.message : String(e)),
    );
  }, [params.id, params.planned]);

  if (!item) {
    return <Screen padTop={false}>{error ? <ErrorText message={error} /> : <Loading />}</Screen>;
  }

  const logged = !!item.logged_entry_id;
  const ateG = num(ate);
  const ateInvalid = !Number.isFinite(ateG) || ateG <= 0 || ateG > 5000;
  const ateMacros = !ateInvalid ? macrosFor(per100gOf(item), ateG) : null;

  const values = {
    kcal: num(kcal),
    p: num(protein),
    c: num(carbs),
    f: num(fat),
    min: num(minG),
    max: num(maxG),
    fixed: num(fixedG),
  };
  const editInvalid = !name.trim()
    ? 'Give it a name'
    : [values.kcal, values.p, values.c, values.f].some((v) => !Number.isFinite(v) || v < 0)
      ? 'Nutrition values must be zero or more'
      : values.p > 100 || values.c > 100 || values.f > 100 || values.kcal > 950
        ? 'Those are per 100 g: macros can’t exceed 100 g'
        : !Number.isFinite(values.min) || !Number.isFinite(values.max) || values.min < 0 || values.max < values.min
          ? 'Portion range: min must be 0 or more and no bigger than max'
          : fixed && (!Number.isFinite(values.fixed) || values.fixed < 0)
            ? 'Enter the fixed amount in grams'
            : null;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const logIt = () =>
    run(async () => {
      await logPlanItem({ ...item, meal }, ateG);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    });

  const unlog = () =>
    Alert.alert('Un-log this food?', 'Removes it from your food log; the plan works its amount out again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Un-log', style: 'destructive', onPress: () => run(() => deleteFood(item.logged_entry_id!)) },
    ]);

  const save = () => {
    if (editInvalid) return;
    const typical = Math.min(values.max, Math.max(values.min, item.typical_g));
    return run(() =>
      updatePlanItem(item.id, {
        name: name.trim().slice(0, 200),
        meal,
        kcal_100g: values.kcal,
        protein_100g: values.p,
        carbs_100g: values.c,
        fat_100g: values.f,
        min_g: values.min,
        max_g: values.max,
        typical_g: typical,
        fixed_g: fixed ? values.fixed : null,
        source,
        source_ref: sourceRef,
      }),
    );
  };

  const remove = () =>
    Alert.alert('Remove from plan?', item.name, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => run(() => deletePlanItems([item.id])) },
    ]);

  function applyDatabaseFood(f: FoodResult) {
    setName(f.brand ? `${f.name} · ${f.brand}` : f.name);
    setKcal(str(f.per100g.kcal));
    setProtein(str(f.per100g.protein_g));
    setCarbs(str(f.per100g.carbs_g));
    setFat(str(f.per100g.fat_g));
    setSource(f.source);
    setSourceRef(f.ref);
    setSearching(false);
  }

  const mealLabel = slots.find((x) => x.key === item.meal)?.label ?? 'your log';
  const sourceLabel =
    item.source === 'ai' ? 'AI estimate' : item.source === 'usda' ? 'USDA' : item.source === 'off' ? 'Open Food Facts' : 'Your values';
  const macroLabel = (color: string, label: string) => (
    <Row gap={5}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
      <Text style={{ fontSize: 12, fontWeight: '600', color: c.text2 }}>{label}</Text>
    </Row>
  );

  return (
    <Screen padTop={false}>
      <Stack.Screen options={{ title: logged ? 'Logged food' : 'Planned food' }} />

      <View style={{ gap: 6 }}>
        <T variant="title" style={{ fontSize: 22, lineHeight: 28 }}>
          {item.name}
        </T>
        <Row gap={Spacing.sm} style={{ flexWrap: 'wrap' }}>
          <SourceBadge label={sourceLabel} />
          <T variant="footnote" style={{ fontVariant: ['tabular-nums'] }}>
            per 100 g: {fmt(item.kcal_100g)} kcal · P {fmt(item.protein_100g)} · C {fmt(item.carbs_100g)} · F {fmt(item.fat_100g)}
          </T>
        </Row>
      </View>

      {logged ? (
        <View style={{ backgroundColor: c.goodBg, borderRadius: 22, paddingVertical: 14, paddingHorizontal: Spacing.lg, flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="check" size={16} color={c.onAccent} strokeWidth={2.8} />
          </View>
          <View style={{ flex: 1 }}>
            <T style={{ fontWeight: '600' }}>Logged to {mealLabel}</T>
            <T variant="footnote">Edit the amount in Today’s log; the plan re-balances.</T>
          </View>
          <Button title="Un-log" variant="secondary" size="S" onPress={unlog} loading={busy} style={{ height: 36, backgroundColor: c.surface }} />
        </View>
      ) : (
        <Card hero style={{ gap: 10, borderRadius: 22 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T variant="headline">Log what you ate</T>
            <T variant="footnote">Planned {params.planned ? amountLabel(item, Number(params.planned)) : '—'}</T>
          </Row>
          <GramsField value={ate} onChangeText={setAte} height={64} />
          {ateMacros ? (
            <Row gap={Spacing.md} style={{ flexWrap: 'wrap' }}>
              <Num size="m" style={{ fontSize: 20, lineHeight: 24 }}>
                {fmt(ateMacros.kcal)} kcal
              </Num>
              <T variant="footnote" style={{ fontVariant: ['tabular-nums'] }}>
                P {fmt(ateMacros.protein_g)} · C {fmt(ateMacros.carbs_g)} · F {fmt(ateMacros.fat_g)}
              </T>
            </Row>
          ) : null}
          <Button
            title={ateInvalid ? 'Log it' : `Log ${fmt(ateG)} g`}
            onPress={logIt}
            loading={busy}
            disabled={ateInvalid}
            style={{ height: 52, borderRadius: 16 }}
          />
          <T variant="footnote">Weigh it and enter what you actually had; the rest of the day re-balances.</T>
        </Card>
      )}

      <View
        pointerEvents={logged ? 'none' : 'auto'}
        accessibilityState={{ disabled: logged }}
        style={{ gap: Spacing.md, opacity: logged ? 0.45 : 1 }}>
        <Card style={{ gap: Spacing.md, borderRadius: 22 }}>
          <Row style={{ minHeight: 52, justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <T style={{ fontWeight: '600' }}>Fix this amount</T>
              <T variant="footnote">Always have exactly this much; the plan works around it.</T>
            </View>
            <Switch
              value={fixed}
              onValueChange={setFixed}
              trackColor={{ true: c.switchOn, false: c.track }}
              thumbColor="#FFFFFF"
              accessibilityLabel="Fix this amount"
            />
          </Row>
          {fixed ? <GramsField value={fixedG} onChangeText={setFixedG} height={56} /> : null}
          <View style={{ gap: Spacing.sm, opacity: fixed ? 0.45 : 1 }} pointerEvents={fixed ? 'none' : 'auto'}>
            <T style={{ fontWeight: '600' }}>Portion range</T>
            <Row gap={Spacing.md} style={{ alignItems: 'flex-start' }}>
              <Field style={{ flex: 1 }} label="Min g" value={minG} onChangeText={setMinG} keyboardType="decimal-pad" />
              <Field style={{ flex: 1 }} label="Max g" value={maxG} onChangeText={setMaxG} keyboardType="decimal-pad" />
            </Row>
            <T variant="footnote">{fixed ? 'Ignored while the amount is fixed.' : 'The plan only picks amounts inside this range.'}</T>
          </View>
        </Card>

        <Overline>Nutrition per 100 g</Overline>
        <Card style={{ gap: Spacing.md, borderRadius: 22 }}>
          <Field label="Name" value={name} onChangeText={setName} />
          <Row gap={Spacing.sm} style={{ alignItems: 'flex-start' }}>
            {[
              { label: 'kcal', value: kcal, set: setKcal, color: c.text2 },
              { label: 'Protein', value: protein, set: setProtein, color: c.protein },
              { label: 'Carbs', value: carbs, set: setCarbs, color: c.carbs },
              { label: 'Fat', value: fat, set: setFat, color: c.fat },
            ].map((m) => (
              <View key={m.label} style={{ flex: 1, gap: 6 }}>
                {macroLabel(m.color, m.label)}
                <TextInput
                  value={m.value}
                  onChangeText={m.set}
                  keyboardType="decimal-pad"
                  accessibilityLabel={`${m.label} per 100 grams`}
                  selectionColor={c.accentLine}
                  maxFontSizeMultiplier={1.3}
                  style={{ height: 48, borderRadius: 12, backgroundColor: c.raised, color: c.text, paddingHorizontal: 10, fontFamily: 'Archivo_700Bold', fontSize: 16 }}
                />
              </View>
            ))}
          </Row>
          {searching ? (
            <FoodSearch onSelect={applyDatabaseFood} />
          ) : (
            <Button title="Use exact values from the food database" variant="ghost" size="S" onPress={() => setSearching(true)} style={{ alignSelf: 'flex-start' }} />
          )}
        </Card>

        <Overline>Meal</Overline>
        <MealPicker value={meal} onChange={setMeal} />

        <ErrorText message={editInvalid ?? error} />
        <Button title="Save changes" size="L" onPress={save} loading={busy} disabled={!!editInvalid} />
      </View>
      {logged ? (
        <>
          <T variant="footnote" style={{ textAlign: 'center' }}>
            Un-log it to change these settings.
          </T>
          <ErrorText message={error} />
        </>
      ) : null}
      <Button title="Remove from plan" variant="ghost" onPress={remove} style={{ alignSelf: 'center' }} />
      {logged ? (
        <T variant="footnote" style={{ textAlign: 'center' }}>
          Removing it keeps the logged entry.
        </T>
      ) : null}
    </Screen>
  );
}
