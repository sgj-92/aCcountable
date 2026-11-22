import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';

import { Icon } from '@/components/icon';
import { FOOTER_SPACE, Overline, SheetFooter } from '@/components/sheet';
import { Skeleton } from '@/components/skeleton';
import { Button, Card, ErrorText, fmt, IconButton, Num, Row, Screen, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { useMealSlots } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';
import type { Meal } from '@/lib/api';
import { isValidISODate, today } from '@/lib/dates';
import { countLabel, estimateMeals, type FoodResult } from '@/lib/foods';
import { SLOT_KEYS } from '@/lib/meals';
import {
  addPantryToPlan,
  listPantry,
  pantryFromFood,
  portionKcal,
  portionLabel,
  savePantryItems,
  type PantryItem,
} from '@/lib/pantry';
import { listPlanItems } from '@/lib/plans';

interface Draft {
  key: string;
  meal: Meal;
  food: FoodResult;
  grams: number;
  include: boolean;
}

const isMeal = (m: string): m is Meal => (SLOT_KEYS as readonly string[]).includes(m);

/**
 * Your pantry: the foods in your diet with their usual portions, grouped by meal.
 * With ?pick=plan it becomes a picker that adds the chosen foods to that day's plan.
 */
export default function PantryScreen() {
  const c = useTheme();
  const params = useLocalSearchParams<{ pick?: string; date?: string }>();
  const picking = params.pick === 'plan';
  const date = params.date && isValidISODate(params.date) ? params.date : today();
  const slots = useMealSlots();
  const { data, error, reload } = useAsync(listPantry, 'pantry');
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const missing = error != null && /isn’t set up/.test(error);
  const items = data ?? [];
  const q = query.trim().toLowerCase();
  const shown = q ? items.filter((p) => p.name.toLowerCase().includes(q)) : items;
  const groups = [
    ...slots.map((s) => ({ key: s.key as string, label: s.label, rows: shown.filter((p) => p.meals.includes(s.key)) })),
    { key: 'any', label: 'Any time', rows: shown.filter((p) => p.meals.length === 0) },
  ].filter((g) => g.rows.length > 0);

  async function estimate() {
    if (text.trim().length < 2) return;
    setBusy(true);
    setActionError(null);
    try {
      const r = await estimateMeals(
        text.trim(),
        slots.map((s) => ({ key: s.key, label: s.label })),
      );
      if (r.length === 0) {
        setActionError('The AI couldn’t find any foods in that. Try one food per line.');
        return;
      }
      setDrafts(
        r.map((x, i) => ({
          key: `${i}:${x.food.name}`,
          meal: isMeal(x.meal) ? x.meal : slots[0].key,
          food: x.food,
          grams: x.food.servings[0]?.grams ?? 100,
          include: true,
        })),
      );
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveDrafts() {
    const chosen = (drafts ?? []).filter((d) => d.include);
    if (chosen.length === 0) return;
    setBusy(true);
    setActionError(null);
    try {
      await savePantryItems(chosen.map((d) => pantryFromFood(d.food, d.grams, d.meal)));
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setDrafts(null);
      setText('');
      setAdding(false);
      reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function addToPlan() {
    const chosen = items.filter((p) => picked.has(p.id));
    if (chosen.length === 0) return;
    setBusy(true);
    setActionError(null);
    try {
      const existing = await listPlanItems(date);
      await addPantryToPlan(chosen, date, existing.length, slots[0].key);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.back();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const footer = drafts ? (
    <Button
      title={`Save ${drafts.filter((d) => d.include).length} to pantry`}
      size="L"
      onPress={saveDrafts}
      loading={busy}
      disabled={!drafts.some((d) => d.include)}
    />
  ) : picking ? (
    <Button
      title={picked.size ? `Add ${picked.size} to the plan` : 'Choose foods to plan'}
      size="L"
      onPress={addToPlan}
      loading={busy}
      disabled={picked.size === 0}
    />
  ) : adding ? (
    <Button title={busy ? 'Working it out…' : 'Estimate these foods'} icon="✨" size="L" onPress={estimate} loading={busy} disabled={text.trim().length < 2} />
  ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: picking ? 'Plan from pantry' : 'Pantry' }} />
      <Screen padTop={false} padBottom={footer ? FOOTER_SPACE + Spacing.xl : undefined}>
        {missing ? (
          <Card hero>
            <T variant="headline">One setup step left</T>
            <T variant="footnote">
              The pantry needs a new table in your database. Run the pantry SQL in Supabase’s SQL Editor, then reopen this screen.
            </T>
          </Card>
        ) : drafts ? (
          <>
            <T variant="footnote" style={{ paddingHorizontal: 4 }}>
              Check the usual portions (− / +) and leave out anything wrong (✕). Each food is filed under the meal you listed it
              for; you can change that on the food afterwards.
            </T>
            {slots
              .filter((s) => drafts.some((d) => d.meal === s.key))
              .map((s) => (
                <View key={s.key} style={{ gap: Spacing.sm }}>
                  <Overline>{s.label}</Overline>
                  <Card style={{ gap: 0, paddingVertical: 4, paddingRight: Spacing.sm }}>
                    {drafts
                      .filter((d) => d.meal === s.key)
                      .map((d, n) => (
                        <DraftRow
                          key={d.key}
                          draft={d}
                          first={n === 0}
                          onChange={(patch) => setDrafts((all) => (all ?? []).map((x) => (x.key === d.key ? { ...x, ...patch } : x)))}
                        />
                      ))}
                  </Card>
                </View>
              ))}
            <ErrorText message={actionError} />
            <Button title="Start over" variant="ghost" onPress={() => setDrafts(null)} style={{ alignSelf: 'center' }} />
          </>
        ) : (
          <>
            {!picking ? (
              adding ? (
                <View style={{ gap: Spacing.sm }}>
                  <T variant="footnote" style={{ paddingHorizontal: 4 }}>
                    List the foods in your diet, by meal if you like, with how much you usually have. The AI fills in the
                    nutrition; you check it before saving.
                  </T>
                  <TextInput
                    value={text}
                    onChangeText={setText}
                    placeholder={`${slots[0]?.label ?? 'Breakfast'}: 2 eggs, 40 g oats, 30 g whey\n${slots[1]?.label ?? 'Lunch'}: 150 g chicken breast, 125 g rice\nSnacks: 1 gluten free muffin, 170 g Greek yoghurt`}
                    placeholderTextColor={c.text3}
                    selectionColor={c.accentLine}
                    multiline
                    autoFocus
                    maxLength={2000}
                    accessibilityLabel="Foods to add to your pantry"
                    style={{
                      minHeight: 180,
                      backgroundColor: c.raised,
                      color: c.text,
                      borderRadius: 16,
                      paddingHorizontal: 14,
                      paddingTop: 12,
                      paddingBottom: 12,
                      fontSize: 17,
                      lineHeight: 24,
                      textAlignVertical: 'top',
                    }}
                  />
                  <ErrorText message={actionError} />
                  <Button title="Cancel" variant="ghost" onPress={() => setAdding(false)} style={{ alignSelf: 'center' }} />
                </View>
              ) : (
                <Row gap={Spacing.sm}>
                  <Button title="Add foods" icon="✨" onPress={() => setAdding(true)} style={{ flex: 1 }} />
                  <Button
                    title="From the database"
                    variant="secondary"
                    onPress={() => router.push({ pathname: '/food', params: { pantry: '1' } })}
                    style={{ flex: 1 }}
                  />
                </Row>
              )
            ) : (
              <T variant="footnote" style={{ paddingHorizontal: 4 }}>
                Tick the foods you’re planning to eat. They go under their usual meal, and the plan works out amounts around
                your usual portions.
              </T>
            )}

            {items.length > 5 ? (
              <Row gap={Spacing.sm} style={{ height: 44, backgroundColor: c.raised, borderRadius: Radius.md, paddingHorizontal: 12 }}>
                <Icon name="search" size={16} color={c.text3} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search your pantry"
                  placeholderTextColor={c.text3}
                  selectionColor={c.accentLine}
                  autoCorrect={false}
                  accessibilityLabel="Search your pantry"
                  style={{ flex: 1, height: '100%', color: c.text, fontSize: 16 }}
                />
              </Row>
            ) : null}

            {!data && !error ? (
              <Card style={{ gap: Spacing.md }}>
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} height={16} radius={8} width={`${70 - i * 15}%`} />
                ))}
              </Card>
            ) : null}
            {error && !missing ? <ErrorText message={error} /> : null}

            {data && items.length === 0 && !adding ? (
              <Card hero style={{ gap: Spacing.sm }}>
                <T variant="headline">Your pantry is empty</T>
                <T variant="footnote">
                  Add the foods you eat as part of your diet with your usual portions. Then log them with one tap in Add food,
                  and build plans from them without retyping.
                </T>
              </Card>
            ) : null}

            {groups.map((g) => (
              <View key={g.key} style={{ gap: Spacing.sm }}>
                <Overline>{g.label}</Overline>
                <Card style={{ gap: 0, paddingVertical: 4, paddingRight: Spacing.sm }}>
                  {g.rows.map((p, n) => (
                    <PantryRow
                      key={p.id}
                      item={p}
                      first={n === 0}
                      selected={picking ? picked.has(p.id) : undefined}
                      onPress={() =>
                        picking ? toggle(p.id) : router.push({ pathname: '/pantry-item', params: { id: p.id } })
                      }
                    />
                  ))}
                </Card>
              </View>
            ))}
            {picking ? <ErrorText message={actionError} /> : null}
          </>
        )}
      </Screen>
      {footer ? <SheetFooter>{footer}</SheetFooter> : null}
    </View>
  );
}

function PantryRow({
  item,
  first,
  selected,
  onPress,
}: {
  item: PantryItem;
  first: boolean;
  /** Defined in pick mode. */
  selected?: boolean;
  onPress: () => void;
}) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole={selected === undefined ? 'button' : 'checkbox'}
      accessibilityState={selected === undefined ? undefined : { checked: selected }}
      accessibilityLabel={`${item.name}, usually ${portionLabel(item, item.portion_g)}, ${portionKcal(item, item.portion_g)} kcal`}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 56,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: c.line,
        opacity: pressed ? 0.6 : 1,
      })}>
      {selected !== undefined ? (
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            borderWidth: selected ? 0 : 2,
            borderColor: c.text3,
            backgroundColor: selected ? c.accent : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          {selected ? <Icon name="check" size={14} color={c.onAccent} strokeWidth={3} /> : null}
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <T numberOfLines={2}>{item.name}</T>
        <T variant="footnote" style={{ fontVariant: ['tabular-nums'] }}>
          Usually {portionLabel(item, item.portion_g)}
        </T>
      </View>
      <Num size="xs">{fmt(portionKcal(item, item.portion_g))}</Num>
      {selected === undefined ? <Icon name="chevron-right" size={16} color={c.text3} strokeWidth={2.2} /> : null}
    </Pressable>
  );
}

function DraftRow({ draft, first, onChange }: { draft: Draft; first: boolean; onChange: (p: Partial<Draft>) => void }) {
  const c = useTheme();
  const { food, grams, include } = draft;
  const unit = food.unit;
  const base = food.servings[0]?.grams ?? 100;
  const stepG = unit ? unit.grams / 2 : Math.max(5, Math.round(base / 4 / 5) * 5);
  const amount = unit ? `${countLabel(grams / unit.grams, unit.name)} · ${fmt(grams)} g` : `${fmt(grams)} g`;
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
        <T numberOfLines={2}>{food.name}</T>
        <T variant="footnote" style={{ fontVariant: ['tabular-nums'] }}>
          Usually {amount} · {fmt((food.per100g.kcal * grams) / 100)} kcal
        </T>
      </View>
      {include ? (
        <>
          <IconButton glyph="−" label={`Smaller usual portion of ${food.name}`} size={32} disabled={grams - stepG <= 0} onPress={() => onChange({ grams: grams - stepG })} />
          <IconButton glyph="+" label={`Bigger usual portion of ${food.name}`} size={32} onPress={() => onChange({ grams: grams + stepG })} />
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
