import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { Overline } from '@/components/sheet';
import { Skeleton } from '@/components/skeleton';
import { TabHeader } from '@/components/tab-header';
import { Button, Card, ErrorText, fmt, Loading, Num, Row, Screen, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { useCountUp } from '@/hooks/use-count-up';
import { useTheme } from '@/hooks/use-theme';
import { computeWeek, loadWeek } from '@/lib/adaptive';
import { isProfileComplete } from '@/lib/api';
import { resolveSlots, slotsForData } from '@/lib/meals';
import { addDays, formatDay, formatLongDay, today } from '@/lib/dates';
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
  const [inputFocused, setInputFocused] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);

  const { data, error, reload, refreshing, refresh } = useAsync(async () => {
    const [week, items] = await Promise.all([loadWeek(date), listPlanItems(date)]);
    return { week, items };
  }, date);

  const stepper = (
    <TabHeader
      sub={date === today() ? `Today · ${formatDay(date)}` : formatLongDay(date)}
      title="Plan"
      onPrev={() => setDate(addDays(date, -1))}
      onNext={() => setDate(addDays(date, 1))}
      back={date === today() ? null : { label: 'Back to today', onPress: () => setDate(today()) }}
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
    <View style={{ gap: Spacing.md }}>
      {busy ? (
        <Card hero style={{ gap: Spacing.md }}>
          <T variant="headline">Working out your foods…</T>
          <T variant="footnote">Finding each food’s nutrition, then the amounts that hit your targets.</T>
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ gap: 6 }}>
              <Skeleton width="65%" height={18} radius={9} />
              <Skeleton width="40%" height={12} radius={6} />
            </View>
          ))}
        </Card>
      ) : (
        <>
          <View style={{ gap: 4, paddingHorizontal: 4 }}>
            <T variant="headline">{items.length ? 'Add more foods' : 'What are you eating today?'}</T>
            <T variant="footnote">List the foods, by meal if you like. No amounts needed: they’re worked out to hit your targets.</T>
          </View>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={EXAMPLE}
            placeholderTextColor={c.text3}
            selectionColor={c.accentLine}
            multiline
            accessibilityLabel="Foods for the day"
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            style={{
              minHeight: items.length ? 140 : 232,
              maxHeight: 320,
              backgroundColor: c.raised,
              color: c.text,
              borderRadius: 16,
              borderWidth: 2,
              borderColor: inputFocused ? c.accentLine : 'transparent',
              paddingHorizontal: 14,
              paddingTop: 12,
              paddingBottom: 12,
              fontSize: 17,
              lineHeight: 24,
              textAlignVertical: 'top',
            }}
          />
        </>
      )}
      <Button
        title={busy ? 'Planning…' : items.length ? 'Add to plan' : 'Plan my amounts'}
        size="L"
        onPress={addFoods}
        loading={busy}
        disabled={text.trim().length < 2}
      />
      {items.length && !busy ? <Button title="Cancel" variant="ghost" onPress={() => setAdding(false)} /> : null}
    </View>
  );

  return (
    <Screen padBottom={120} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      {stepper}
      <ErrorText message={error ?? actionError} />

      {!isProfileComplete(profile) || !target ? (
        <Card hero>
          <T variant="headline">Set up your profile</T>
          <T variant="footnote">The plan needs your daily targets, which come from your profile.</T>
          <Button title="Go to profile" onPress={() => router.navigate('/profile')} />
        </Card>
      ) : items.length === 0 ? (
        input
      ) : (
        <>
          <Card hero style={{ gap: Spacing.md }}>
            <View>
              <Overline>Planned for the day</Overline>
              <Row gap={Spacing.sm} style={{ alignItems: 'baseline', paddingHorizontal: 4 }}>
                <CountUpNum value={planned!.kcal} />
                <T variant="headline" color={c.text2}>
                  of {fmt(target.kcal)} kcal
                </T>
              </Row>
              <T variant="footnote" style={{ paddingHorizontal: 4 }}>
                {consumed.kcal > 0 ? `${fmt(consumed.kcal)} already eaten` : 'Nothing logged yet'}
              </T>
            </View>
            <Row gap={Spacing.md} style={{ alignItems: 'flex-start' }}>
              <MacroDiff label="Protein" planned={planned!.protein_g} target={target.protein_g} color={c.protein} />
              <MacroDiff label="Carbs" planned={planned!.carbs_g} target={target.carbs_g} color={c.carbs} />
              <MacroDiff label="Fat" planned={planned!.fat_g} target={target.fat_g} color={c.fat} />
            </Row>
            {gaps.length === 0 ? (
              <StatusLine level="good" text="On target. Weigh as you go and log what you actually eat; the rest re-balances." />
            ) : (
              gaps.map((g) => (
                <StatusLine
                  key={g.key}
                  level="alert"
                  text={`${g.label} ${fmt(Math.abs(g.diff))} ${g.unit} ${g.diff < 0 ? 'short' : 'over'}: ${
                    g.diff < 0
                      ? `add a ${g.key === 'protein_g' ? 'protein' : g.key === 'fat_g' ? 'fat' : g.key === 'carbs_g' ? 'carb' : 'more filling'} food, or allow bigger portions.`
                      : 'swap something out, or allow smaller portions.'
                  }`}
                  action={g.diff < 0 ? { label: 'Add', onPress: () => setAdding(true) } : undefined}
                />
              ))
            )}
            {notes ? (
              <Pressable onPress={() => setNotesOpen(!notesOpen)} accessibilityRole="button" accessibilityHint="Shows the whole note">
                <T variant="footnote" numberOfLines={notesOpen ? undefined : 3}>
                  {notes}
                </T>
              </Pressable>
            ) : null}
          </Card>

          {slotsForData(
            slots,
            items.map((i) => i.meal),
          ).map(({ key: meal, label }) => {
            const mealItems = items.filter((i) => i.meal === meal);
            if (mealItems.length === 0) return null;
            const rows = mealItems.map((item) => {
              const logged = isLogged(item);
              const grams = logged ? (loggedGrams.get(item.logged_entry_id!) ?? 0) : (solution?.grams[item.id] ?? item.typical_g);
              return { item, logged, grams, m: macrosFor(per100gOf(item), grams) };
            });
            const total = rows.reduce((t, r) => t + r.m.kcal, 0);
            return (
              <Card key={meal} style={{ gap: 0, paddingVertical: 4, paddingRight: Spacing.sm }}>
                <Row style={{ minHeight: 44, justifyContent: 'space-between' }}>
                  <Overline>{label}</Overline>
                  <Num size="xxs" color={c.text2} style={{ fontSize: 14, marginRight: Spacing.sm }}>
                    {fmt(total)} kcal
                  </Num>
                </Row>
                {rows.map(({ item, logged, grams, m }, idx) => (
                  <Animated.View key={item.id} entering={FadeInDown.duration(220).delay(idx * 30)} layout={LinearTransition}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${item.name}, ${amountLabel(item, grams)}${logged ? ', logged' : ''}`}
                      onPress={() => router.push({ pathname: '/plan-item', params: { id: item.id, planned: String(grams) } })}
                      style={({ pressed }) => ({
                        minHeight: 64,
                        paddingVertical: 10,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: Spacing.md,
                        borderTopWidth: 1,
                        borderTopColor: c.line,
                        opacity: logged ? 0.5 : pressed ? 0.7 : 1,
                      })}>
                      {logged ? (
                        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
                          <Icon name="check" size={15} color={c.onAccent} strokeWidth={2.8} />
                        </View>
                      ) : null}
                      <View style={{ flex: 1, gap: 2 }}>
                        <Num size="m">{amountLabel(item, grams)}</Num>
                        <T numberOfLines={2}>{item.name}</T>
                        <Row gap={6}>
                          <T variant="footnote" style={{ fontVariant: ['tabular-nums'], flexShrink: 1 }} numberOfLines={1}>
                            {fmt(m.kcal)} kcal · P {fmt(m.protein_g)} · C {fmt(m.carbs_g)} · F {fmt(m.fat_g)}
                          </T>
                          {item.fixed_g != null && !logged ? (
                            <View style={{ height: 22, paddingHorizontal: 8, borderRadius: 11, backgroundColor: c.raised, justifyContent: 'center' }}>
                              <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.5, color: c.text2 }}>🔒 FIXED</Text>
                            </View>
                          ) : null}
                        </Row>
                      </View>
                      <Icon name="chevron-right" size={16} color={c.text3} strokeWidth={2.2} />
                    </Pressable>
                  </Animated.View>
                ))}
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
          <T variant="footnote" style={{ textAlign: 'center' }}>
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
  const off = Math.abs(diff) > 5;
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Row gap={5}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
        <T variant="caption">{label}</T>
      </Row>
      <Text maxFontSizeMultiplier={1.3}>
        <Num size="xs" color={off ? c.alert : c.text}>
          {fmt(planned)}
        </Num>
        <Text style={{ fontSize: 13, color: c.text2 }}> / {fmt(target)} g</Text>
      </Text>
      <T variant="caption" color={off ? c.alert : c.text2} style={{ fontWeight: '400', fontVariant: ['tabular-nums'] }}>
        {diff === 0 ? 'exact' : `${diff > 0 ? '+' : '−'}${Math.abs(diff)} g`}
      </T>
    </View>
  );
}

/** One-line status on its tint, e.g. "On target" or a gap with its fix. */
function StatusLine({
  level,
  text,
  action,
}: {
  level: 'good' | 'alert';
  text: string;
  action?: { label: string; onPress: () => void };
}) {
  const c = useTheme();
  return (
    <Row gap={Spacing.sm} style={{ backgroundColor: level === 'good' ? c.goodBg : c.alertBg, borderRadius: Radius.md, paddingVertical: 10, paddingHorizontal: 12 }}>
      <Icon name={level === 'good' ? 'good' : 'alert'} size={18} color={level === 'good' ? c.good : c.alert} />
      <T variant="footnote" color={c.text} style={{ flex: 1 }}>
        {text}
      </T>
      {action ? <Button title={action.label} variant="secondary" size="S" onPress={action.onPress} /> : null}
    </Row>
  );
}

function CountUpNum({ value }: { value: number }) {
  return <Num size="xl">{fmt(useCountUp(value))}</Num>;
}
