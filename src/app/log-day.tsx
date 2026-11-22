import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';

import { Icon } from '@/components/icon';
import { FOOTER_SPACE, Overline, SheetFooter } from '@/components/sheet';
import { Button, Card, ErrorText, fmt, IconButton, Num, Row, Screen, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useMealSlots } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';
import { addFood, type Meal, type NewFoodEntry } from '@/lib/api';
import { formatDay, isValidISODate, today } from '@/lib/dates';
import { countLabel, estimateMeals, scale, type FoodResult } from '@/lib/foods';
import { SLOT_KEYS, slotsForData } from '@/lib/meals';

interface Item {
  key: string;
  meal: Meal;
  food: FoodResult;
  grams: number;
  include: boolean;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const isMeal = (m: string): m is Meal => (SLOT_KEYS as readonly string[]).includes(m);

/** Describe the day (or several meals) in words; the AI splits it into foods per meal to review and log at once. */
export default function LogDayScreen() {
  const c = useTheme();
  const params = useLocalSearchParams<{ date?: string }>();
  const date = params.date && isValidISODate(params.date) ? params.date : today();
  const slots = useMealSlots();
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Item[] | null>(null);

  const example = [
    `${slots[0]?.label ?? 'Breakfast'}: 2 eggs, 2 slices of toast with butter, oat milk latte`,
    `${slots[1]?.label ?? 'Lunch'}: chicken wrap, apple`,
    `${slots[2]?.label ?? 'Dinner'}: salmon, rice, broccoli`,
    `${slots[slots.length - 1]?.label ?? 'Snacks'}: 2 gluten free muffins`,
  ].join('\n');

  async function estimate() {
    if (text.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      const r = await estimateMeals(
        text.trim(),
        slots.map((s) => ({ key: s.key, label: s.label })),
      );
      if (r.length === 0) {
        setError('The AI couldn’t find any foods in that. Try listing them like the example.');
        return;
      }
      setItems(
        r.map((x, i) => ({
          key: `${i}:${x.food.name}`,
          meal: isMeal(x.meal) ? x.meal : slots[0].key,
          food: x.food,
          grams: x.food.servings[0]?.grams ?? 100,
          include: true,
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const update = (key: string, patch: Partial<Item>) =>
    setItems((all) => (all ?? []).map((it) => (it.key === key ? { ...it, ...patch } : it)));

  const chosen = (items ?? []).filter((i) => i.include && i.grams > 0);
  const totals = chosen.reduce(
    (t, i) => {
      const v = scale(i.food.per100g, i.grams);
      return { kcal: t.kcal + v.kcal, p: t.p + v.protein_g, c: t.c + v.carbs_g, f: t.f + v.fat_g };
    },
    { kcal: 0, p: 0, c: 0, f: 0 },
  );

  async function logAll() {
    if (chosen.length === 0) return;
    setSaving(true);
    setError(null);
    const entries: NewFoodEntry[] = chosen.map((i) => {
      const v = scale(i.food.per100g, i.grams);
      const amount = i.food.unit ? countLabel(i.grams / i.food.unit.grams, i.food.unit.name) : null;
      return {
        date,
        meal: i.meal,
        name: i.food.name.slice(0, 200),
        serving: amount ? `${amount} · about ${fmt(i.grams)} g` : `about ${fmt(i.grams)} g`,
        ...v,
        grams: round1(i.grams),
        source: 'manual',
        source_ref: null,
        ai_confidence: null,
      };
    });
    try {
      await addFood(entries);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  const title = date === today() ? 'Log your day' : `Log ${formatDay(date)}`;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title }} />
      <Screen padTop={false} padBottom={FOOTER_SPACE + Spacing.xl}>
        {!items ? (
          <>
            <View style={{ gap: 4, paddingHorizontal: 4 }}>
              <T variant="headline">What have you eaten so far?</T>
              <T variant="footnote">
                Write it however you like, by meal if you want. Amounts are optional (“2 muffins”, “a bowl of”); the AI fills in
                the rest and you check it before anything is logged.
              </T>
            </View>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={example}
              placeholderTextColor={c.text3}
              selectionColor={c.accentLine}
              multiline
              autoFocus
              maxLength={2000}
              accessibilityLabel="What you ate today"
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              style={{
                minHeight: 220,
                maxHeight: 360,
                backgroundColor: c.raised,
                color: c.text,
                borderRadius: 16,
                borderWidth: 2,
                borderColor: focused ? c.accentLine : 'transparent',
                paddingHorizontal: 14,
                paddingTop: 12,
                paddingBottom: 12,
                fontSize: 17,
                lineHeight: 24,
                textAlignVertical: 'top',
              }}
            />
            <ErrorText message={error} />
          </>
        ) : (
          <>
            <Card hero style={{ gap: 4 }}>
              <Overline>{`${chosen.length} food${chosen.length === 1 ? '' : 's'} to log`}</Overline>
              <Row gap={Spacing.sm} style={{ alignItems: 'baseline', paddingHorizontal: 4 }}>
                <Num size="l">≈ {fmt(totals.kcal)}</Num>
                <T variant="footnote">kcal</T>
              </Row>
              <T variant="footnote" style={{ paddingHorizontal: 4, fontVariant: ['tabular-nums'] }}>
                P {fmt(totals.p)} g · C {fmt(totals.c)} g · F {fmt(totals.f)} g · all AI estimates
              </T>
            </Card>
            {slotsForData(
              slots,
              items.map((i) => i.meal),
            ).map((slot) => {
              const rows = items.filter((i) => i.meal === slot.key);
              if (rows.length === 0) return null;
              return (
                <View key={slot.key} style={{ gap: Spacing.sm }}>
                  <Overline>{slot.label}</Overline>
                  <Card style={{ gap: 0, paddingVertical: 4, paddingRight: Spacing.sm }}>
                    {rows.map((i, n) => (
                      <ReviewRow key={i.key} item={i} first={n === 0} onChange={(patch) => update(i.key, patch)} />
                    ))}
                  </Card>
                </View>
              );
            })}
            <T variant="footnote" style={{ paddingHorizontal: 4 }}>
              Use − and + to adjust amounts, or ✕ to leave something out. You can edit or move any entry on Today afterwards.
            </T>
            <ErrorText message={error} />
            <Button title="Start over" variant="ghost" onPress={() => setItems(null)} style={{ alignSelf: 'center' }} />
          </>
        )}
      </Screen>
      <SheetFooter>
        {items ? (
          <Button
            title={`Log ${chosen.length} food${chosen.length === 1 ? '' : 's'} · ≈ ${fmt(totals.kcal)} kcal`}
            size="L"
            onPress={logAll}
            loading={saving}
            disabled={chosen.length === 0}
          />
        ) : (
          <Button
            title={busy ? 'Working it out…' : 'Estimate my day'}
            icon="✨"
            size="L"
            onPress={estimate}
            loading={busy}
            disabled={text.trim().length < 2}
          />
        )}
      </SheetFooter>
    </View>
  );
}

function ReviewRow({ item, first, onChange }: { item: Item; first: boolean; onChange: (p: Partial<Item>) => void }) {
  const c = useTheme();
  const { food, grams, include } = item;
  const unit = food.unit;
  const v = scale(food.per100g, grams);
  const base = food.servings[0]?.grams ?? 100;
  // Pieces step by half a unit; other foods by a quarter of the suggested amount.
  const stepG = unit ? unit.grams / 2 : Math.max(5, Math.round(base / 4 / 5) * 5);
  const amount = unit ? `${countLabel(grams / unit.grams, unit.name)} · about ${fmt(grams)} g` : `about ${fmt(grams)} g`;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        minHeight: 64,
        paddingVertical: 8,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: c.line,
        opacity: include ? 1 : 0.4,
      }}>
      <View style={{ flex: 1, gap: 2 }}>
        <T numberOfLines={2} style={{ textDecorationLine: include ? 'none' : 'line-through' }}>
          {food.name}
        </T>
        <T variant="footnote" numberOfLines={1} style={{ fontVariant: ['tabular-nums'] }}>
          {amount}
        </T>
      </View>
      {include ? (
        <>
          <IconButton glyph="−" label={`Less ${food.name}`} size={32} disabled={grams - stepG <= 0} onPress={() => onChange({ grams: grams - stepG })} />
          <Num size="xs" style={{ minWidth: 44, textAlign: 'center' }}>
            {fmt(v.kcal)}
          </Num>
          <IconButton glyph="+" label={`More ${food.name}`} size={32} onPress={() => onChange({ grams: grams + stepG })} />
        </>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={include ? `Leave out ${food.name}` : `Put back ${food.name}`}
        onPress={() => onChange({ include: !include })}
        style={{ width: 36, height: 44, alignItems: 'center', justifyContent: 'center' }}>
        {include ? (
          <Icon name="close" size={16} color={c.text3} strokeWidth={2.4} />
        ) : (
          <T color={c.accentText} style={{ fontSize: 13, fontWeight: '700' }}>
            Undo
          </T>
        )}
      </Pressable>
    </View>
  );
}
