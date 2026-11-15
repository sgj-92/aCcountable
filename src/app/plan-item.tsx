import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Switch, View } from 'react-native';

import { FoodSearch } from '@/components/food-search';
import { Button, Card, ErrorText, Field, fmt, Loading, Row, Screen, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { MealPicker } from '@/components/meal-picker';
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

  const logIt = () => run(() => logPlanItem({ ...item, meal }, ateG));

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

  return (
    <Screen padTop={false}>
      <Stack.Screen options={{ title: logged ? 'Logged food' : 'Planned food' }} />

      <Card>
        <T variant="heading">{item.name}</T>
        <T variant="small">
          Per 100 g: {fmt(item.kcal_100g)} kcal · P {fmt(item.protein_100g)} · C {fmt(item.carbs_100g)} · F{' '}
          {fmt(item.fat_100g)} ·{' '}
          {item.source === 'ai' ? 'AI estimate' : item.source === 'usda' ? 'USDA' : item.source === 'off' ? 'Open Food Facts' : 'your values'}
        </T>
      </Card>

      {logged ? (
        <Card>
          <T variant="heading">✓ Logged</T>
          <T variant="muted">To change the amount, edit it in Today’s log. The rest of the plan re-balances around it.</T>
          <Button title="Un-log" variant="secondary" onPress={unlog} loading={busy} />
        </Card>
      ) : (
        <Card style={{ gap: Spacing.md }}>
          <T variant="heading">Log what you ate</T>
          <T variant="muted">
            Planned: {params.planned ? amountLabel(item, Number(params.planned)) : '—'}. Weigh it and enter the actual
            amount; the rest of the day re-balances.
          </T>
          <Field label="I ate (g)" value={ate} onChangeText={setAte} keyboardType="decimal-pad" selectTextOnFocus />
          {ateMacros ? (
            <T variant="muted">
              {fmt(ateMacros.kcal)} kcal · P {fmt(ateMacros.protein_g)} · C {fmt(ateMacros.carbs_g)} · F{' '}
              {fmt(ateMacros.fat_g)}
            </T>
          ) : null}
          <Button title={ateInvalid ? 'Log it' : `Log ${fmt(ateG)} g`} onPress={logIt} loading={busy} disabled={ateInvalid} />
        </Card>
      )}

      {!logged ? (
        <>
          <Card style={{ gap: Spacing.md }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <T variant="heading">Fix this amount</T>
                <T variant="small">Always have exactly this much; the plan works around it.</T>
              </View>
              <Switch value={fixed} onValueChange={setFixed} trackColor={{ true: c.primary }} accessibilityLabel="Fix this amount" />
            </Row>
            {fixed ? (
              <Field label="Amount (g)" value={fixedG} onChangeText={setFixedG} keyboardType="decimal-pad" />
            ) : null}
            <T variant="heading">Portion range</T>
            <Row gap={Spacing.md}>
              <Field style={{ flex: 1 }} label="Min (g)" value={minG} onChangeText={setMinG} keyboardType="decimal-pad" />
              <Field style={{ flex: 1 }} label="Max (g)" value={maxG} onChangeText={setMaxG} keyboardType="decimal-pad" />
            </Row>
            <T variant="small">The plan only picks amounts inside this range.</T>
          </Card>

          <Card style={{ gap: Spacing.md }}>
            <T variant="heading">Food and nutrition</T>
            <MealPicker value={meal} onChange={setMeal} />
            <Field label="Name" value={name} onChangeText={setName} />
            <Row gap={Spacing.sm}>
              <Field style={{ flex: 1.2 }} label="kcal/100 g" value={kcal} onChangeText={setKcal} keyboardType="decimal-pad" />
              <Field style={{ flex: 1 }} label="P g" value={protein} onChangeText={setProtein} keyboardType="decimal-pad" />
              <Field style={{ flex: 1 }} label="C g" value={carbs} onChangeText={setCarbs} keyboardType="decimal-pad" />
              <Field style={{ flex: 1 }} label="F g" value={fat} onChangeText={setFat} keyboardType="decimal-pad" />
            </Row>
            {searching ? (
              <FoodSearch onSelect={applyDatabaseFood} />
            ) : (
              <Button
                title="Use exact values from the food database"
                variant="secondary"
                onPress={() => setSearching(true)}
              />
            )}
          </Card>

          <ErrorText message={editInvalid ?? error} />
          <Button title="Save changes" onPress={save} loading={busy} disabled={!!editInvalid} />
        </>
      ) : (
        <ErrorText message={error} />
      )}
      <Button title="Remove from plan" variant="ghost" onPress={remove} />
      {!logged ? null : <T variant="small" color={c.textMuted} style={{ textAlign: 'center' }}>Removing it keeps the logged entry.</T>}
    </Screen>
  );
}
