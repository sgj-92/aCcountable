import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { MealPicker } from '@/components/meal-picker';
import { Overline } from '@/components/sheet';
import { minutesOf, TimeField } from '@/components/time-field';
import { Button, ErrorText, fmt, Loading, Screen, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { useMealSlots, useProfile } from '@/hooks/use-profile';
import { listFood, updateFoods, type Meal } from '@/lib/api';
import { isValidISODate, today } from '@/lib/dates';
import { formatClock } from '@/lib/fasting';
import { eatenMinutes, SLOT_KEYS } from '@/lib/meals';
import { listPlanItems, updatePlanItem } from '@/lib/plans';

/**
 * Set when a meal was eaten, or move it to another meal. Opened from a meal's time pill on Today:
 * with `meal`, the whole meal (and its planned foods); with `ids`, just those entries (a time group).
 */
export default function MealTimeSheet() {
  const params = useLocalSearchParams<{ date?: string; meal?: string; ids?: string }>();
  const date = params.date && isValidISODate(params.date) ? params.date : today();
  const fromMeal = (SLOT_KEYS as readonly string[]).includes(params.meal ?? '') ? (params.meal as Meal) : null;
  const ids = (params.ids ?? '').split(',').filter(Boolean);
  const slots = useMealSlots();
  const { profile } = useProfile();
  const timeMode = profile?.meal_mode === 'time';
  const label = fromMeal ? (slots.find((s) => s.key === fromMeal)?.label ?? 'Meal') : 'These foods';

  const { data, error } = useAsync(async () => {
    const [food, plan] = await Promise.all([listFood(date, date), listPlanItems(date)]);
    const entries = ids.length ? food.filter((f) => ids.includes(f.id)) : food.filter((f) => f.meal === fromMeal);
    const planned = fromMeal && !ids.length ? plan.filter((p) => p.meal === fromMeal && !p.logged_entry_id) : [];
    return { entries, planned };
  }, `${date}:${params.meal}:${params.ids}`);

  const first = data?.entries.map(eatenMinutes).filter((m): m is number => m != null).sort((a, b) => a - b)[0];
  const [time, setTime] = useState<string | null>(null);
  const [target, setTarget] = useState<Meal | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (!data) return <Screen padTop={false}>{error ? <ErrorText message={error} /> : <Loading />}</Screen>;

  const timeText = time ?? (first != null ? formatClock(first) : '');
  const minutes = minutesOf(timeText);
  const invalid = timeText.trim() !== '' && minutes == null;
  const moveTo = target ?? fromMeal ?? data.entries[0]?.meal ?? 'snack';
  const kcal = data.entries.reduce((t, f) => t + f.kcal, 0);

  async function save() {
    setBusy(true);
    setSaveError(null);
    try {
      await updateFoods(
        data!.entries.map((f) => f.id),
        { ...(minutes != null ? { eaten_at: minutes } : {}), ...(target ? { meal: target } : {}) },
      );
      if (target && target !== fromMeal) {
        await Promise.all(data!.planned.map((p) => updatePlanItem(p.id, { meal: target })));
      }
      router.back();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <Screen padTop={false}>
      <Stack.Screen options={{ title: timeMode ? 'Time eaten' : label }} />
      <T variant="footnote">
        {data.entries.length
          ? `${data.entries.length} food${data.entries.length === 1 ? '' : 's'} · ${fmt(kcal)} kcal`
          : data.planned.length
            ? `${data.planned.length} planned food${data.planned.length === 1 ? '' : 's'}, nothing logged yet`
            : 'Nothing logged here yet'}
      </T>
      {data.entries.length ? (
        <TimeField value={timeText} onChange={setTime} emptyLabel="When logged" />
      ) : null}
      {!timeMode ? (
        <>
          <Overline>Move to</Overline>
          <MealPicker value={moveTo} onChange={setTarget} />
          {target && target !== fromMeal && data.planned.length ? (
            <T variant="footnote">Its planned foods move too.</T>
          ) : null}
        </>
      ) : null}
      <ErrorText message={saveError} />
      <Button
        title="Save"
        size="L"
        onPress={save}
        loading={busy}
        disabled={invalid || (time == null && target == null) || (data.entries.length === 0 && data.planned.length === 0)}
        style={{ marginTop: Spacing.md }}
      />
    </Screen>
  );
}
