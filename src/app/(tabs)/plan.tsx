import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, TextInput, View } from 'react-native';

import { Button, Card, Divider, ErrorText, fmt, Loading, Row, Screen, Stepper, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { useTheme } from '@/hooks/use-theme';
import { computeWeek, loadWeek } from '@/lib/adaptive';
import { isProfileComplete } from '@/lib/api';
import { resolveSlots, slotsForData } from '@/lib/meals';
import { addDays, formatDay, today } from '@/lib/dates';
import { sumTotals } from '@/lib/nutrition';
import { addMacros, macrosFor, planGaps, solvePlan, subtractMacros, type Macros } from '@/lib/planner';
import {
  addFoodsFromText,
  amountLabel,
  deletePlanItems,
  listPlanItems,
  per100gOf,
  toPlanFood,
  type PlanItem,
} from '@/lib/plans';

const EXAMPLE =
  'Breakfast: oats, whey, blueberries\nLunch: chicken, rice, broccoli, olive oil\nSnack: Greek yoghurt, honey\nDinner: salmon, potatoes, green beans';

export default function PlanScreen() {
  const c = useTheme();
  const [date, setDate] = useState(today());
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const { data, error, loading, reload } = useAsync(async () => {
    const [week, items] = await Promise.all([loadWeek(date), listPlanItems(date)]);
    return { week, items };
  }, date);

  const stepper = (
    <Stepper
      label={date === today() ? `Today · ${formatDay(date)}` : formatDay(date)}
      onPrev={() => setDate(addDays(date, -1))}
      onNext={() => setDate(addDays(date, 1))}
    />
  );

  if (!data) {
    return (
      <Screen>
        {stepper}
        {error ? <ErrorText message={error} /> : <Loading />}
      </Screen>
    );
  }

  const { week: weekData, items } = data;
  const profile = weekData.profile;
  const food = weekData.food.filter((f) => f.date === date);
  const slots = resolveSlots(profile.meal_slots);
  // Same target as Today: base + training, after weekly balancing.
  const day = computeWeek(weekData, today())?.days[date];
  const target: Macros | null = day
    ? { kcal: day.adjusted, protein_g: day.proteinG, carbs_g: day.carbsG, fat_g: day.fatG }
    : null;

  // Everything already logged today (planned or not) counts; the rest of the plan fills the gap.
  const eaten = sumTotals(food);
  const consumed: Macros = { kcal: eaten.kcal, protein_g: eaten.proteinG, carbs_g: eaten.carbsG, fat_g: eaten.fatG };
  const loggedGrams = new Map(food.map((f) => [f.id, f.grams ?? 0]));
  const isLogged = (i: PlanItem) => !!i.logged_entry_id && loggedGrams.has(i.logged_entry_id);
  const open = items.filter((i) => !isLogged(i));
  const solution = target ? solvePlan(open.map(toPlanFood), subtractMacros(target, consumed), target) : null;
  const planned = solution ? addMacros(consumed, solution.totals) : null;
  const gaps = planned && target ? planGaps(planned, target) : [];

  async function addFoods() {
    if (text.trim().length < 2) return;
    setBusy(true);
    setActionError(null);
    setNotes(null);
    try {
      const r = await addFoodsFromText(date, text.trim(), target, items.length, slots);
      if (r.added === 0) {
        setActionError("Couldn't find any foods in that. Try listing them like the example.");
      } else {
        setText('');
        setAdding(false);
        setNotes(r.notes || null);
        await reload();
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function clearPlan() {
    Alert.alert('Clear the plan?', 'Removes the foods you haven’t logged yet. Logged food stays in your log.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePlanItems(open.map((i) => i.id));
            await reload();
          } catch (e) {
            setActionError(e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);
  }

  const input = (
    <Card style={{ gap: Spacing.md }}>
      <T variant="heading">{items.length ? 'Add more foods' : 'What are you eating today?'}</T>
      <T variant="muted">
        List the foods, by meal if you like. No amounts needed: they’re worked out to hit your targets.
      </T>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={EXAMPLE}
        placeholderTextColor={c.textMuted}
        multiline
        accessibilityLabel="Foods for the day"
        style={{
          minHeight: 120,
          backgroundColor: c.input,
          color: c.text,
          borderRadius: Radius.sm,
          padding: Spacing.md,
          fontSize: 16,
          textAlignVertical: 'top',
        }}
      />
      {busy ? (
        <Row style={{ justifyContent: 'center', paddingVertical: Spacing.sm }} gap={Spacing.md}>
          <ActivityIndicator color={c.primary} />
          <T variant="muted">Working out your foods…</T>
        </Row>
      ) : (
        <Button
          title={items.length ? 'Add to plan' : 'Plan my amounts'}
          icon="✨"
          onPress={addFoods}
          disabled={text.trim().length < 2}
        />
      )}
      {items.length ? <Button title="Cancel" variant="ghost" onPress={() => setAdding(false)} /> : null}
    </Card>
  );

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}>
      {stepper}
      <ErrorText message={error ?? actionError} />

      {!isProfileComplete(profile) || !target ? (
        <Card>
          <T variant="heading">Set up your profile</T>
          <T variant="muted">The plan needs your daily targets, which come from your profile.</T>
          <Button title="Go to profile" onPress={() => router.navigate('/profile')} />
        </Card>
      ) : items.length === 0 ? (
        input
      ) : (
        <>
          {/* Planned vs target */}
          <Card style={{ gap: Spacing.sm }}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <View>
                <T variant="small">Planned for the day</T>
                <T variant="big">{fmt(planned!.kcal)}</T>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <T variant="heading">of {fmt(target.kcal)} kcal</T>
                <T variant="small">{consumed.kcal > 0 ? `${fmt(consumed.kcal)} already eaten` : 'nothing logged yet'}</T>
              </View>
            </Row>
            <Row style={{ flexWrap: 'wrap' }} gap={Spacing.md}>
              <MacroDiff label="P" planned={planned!.protein_g} target={target.protein_g} color={c.protein} />
              <MacroDiff label="C" planned={planned!.carbs_g} target={target.carbs_g} color={c.carbs} />
              <MacroDiff label="F" planned={planned!.fat_g} target={target.fat_g} color={c.fat} />
            </Row>
            {gaps.length === 0 ? (
              <T variant="small" color={c.success}>
                On target. Weigh as you go and log what you actually eat; the rest re-balances.
              </T>
            ) : (
              gaps.map((g) => (
                <T key={g.key} variant="small" color={c.danger}>
                  {g.label} {fmt(Math.abs(g.diff))} {g.unit} {g.diff < 0 ? 'short' : 'over'}:{' '}
                  {g.diff < 0
                    ? `add a ${g.key === 'protein_g' ? 'protein' : g.key === 'fat_g' ? 'fat' : g.key === 'carbs_g' ? 'carb' : 'more filling'} food, or allow bigger portions.`
                    : 'swap something out, or allow smaller portions.'}
                </T>
              ))
            )}
            {notes ? <T variant="small">{notes}</T> : null}
          </Card>

          {/* Foods by meal */}
          {slotsForData(
            slots,
            items.map((i) => i.meal),
          ).map(({ key: meal, label }) => {
            const mealItems = items.filter((i) => i.meal === meal);
            if (mealItems.length === 0) return null;
            return (
              <Card key={meal} style={{ gap: 0 }}>
                <T variant="heading" style={{ marginBottom: Spacing.xs }}>
                  {label}
                </T>
                {mealItems.map((item, idx) => {
                  const logged = isLogged(item);
                  const grams = logged
                    ? (loggedGrams.get(item.logged_entry_id!) ?? 0)
                    : (solution?.grams[item.id] ?? item.typical_g);
                  const m = macrosFor(per100gOf(item), grams);
                  return (
                    <View key={item.id}>
                      {idx > 0 ? <Divider /> : null}
                      <Pressable
                        accessibilityRole="button"
                        onPress={() =>
                          router.push({ pathname: '/plan-item', params: { id: item.id, planned: String(grams) } })
                        }
                        style={{ paddingVertical: Spacing.sm, opacity: logged ? 0.6 : 1 }}>
                        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }} gap={Spacing.md}>
                          <View style={{ flex: 1, gap: 2 }}>
                            <T numberOfLines={2}>
                              {logged ? '✓ ' : ''}
                              {item.name}
                            </T>
                            <T variant="small">
                              {fmt(m.kcal)} kcal · P {fmt(m.protein_g)} · C {fmt(m.carbs_g)} · F {fmt(m.fat_g)}
                              {item.fixed_g != null && !logged ? ' · fixed' : ''}
                            </T>
                          </View>
                          <T variant="heading" color={logged ? c.textMuted : c.primary}>
                            {amountLabel(item, grams)}
                          </T>
                        </Row>
                      </Pressable>
                    </View>
                  );
                })}
              </Card>
            );
          })}

          {adding ? (
            input
          ) : (
            <Row>
              <Button title="Add foods" variant="secondary" onPress={() => setAdding(true)} style={{ flex: 1 }} />
              <Button title="Clear plan" variant="ghost" onPress={clearPlan} style={{ flex: 1 }} />
            </Row>
          )}
          <T variant="small" style={{ textAlign: 'center' }}>
            Tap a food to log what you ate, fix an amount, or check its nutrition.
          </T>
        </>
      )}
    </Screen>
  );
}

function MacroDiff({ label, planned, target, color }: { label: string; planned: number; target: number; color: string }) {
  const c = useTheme();
  const diff = Math.round(planned - target);
  return (
    <Row gap={Spacing.xs}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <T variant="muted">
        {label} {fmt(planned)}/{fmt(target)} g
      </T>
      {Math.abs(diff) >= 1 ? (
        <T variant="small" color={Math.abs(diff) > Math.max(5, target * 0.05) ? c.danger : c.textMuted}>
          ({diff > 0 ? '+' : ''}
          {diff})
        </T>
      ) : null}
    </Row>
  );
}
