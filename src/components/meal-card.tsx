import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Svg, { Line } from 'react-native-svg';

import { Icon } from '@/components/icon';
import { showMenu } from '@/components/menu';
import { PressableScale } from '@/components/pressable-scale';
import { fmt, Num, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { addFoodEntry, deleteFood, updateFood, type FoodEntry } from '@/lib/api';
import { today } from '@/lib/dates';
import { formatClock } from '@/lib/fasting';
import type { MealTime } from '@/lib/meal-times';
import { eatenMinutes, type MealSlot } from '@/lib/meals';
import { amountLabel, deletePlanItems, type PlanItem } from '@/lib/plans';

/** Timeline layout: how far the food cards sit in from the dashed line's side. */
const RAIL = 72;

/** The timeline's dashed line, drawn behind its meals (time pills sit over it). */
export function MealTimeline({ children }: { children: ReactNode }) {
  const c = useTheme();
  return (
    <View style={{ gap: Spacing.xl }}>
      <View pointerEvents="none" style={{ position: 'absolute', left: 35, top: 18, bottom: 8, width: 2 }}>
        <Svg width={2} height="100%">
          <Line x1={1} y1={0} x2={1} y2="100%" stroke={c.line} strokeWidth={2} strokeDasharray="5 7" />
        </Svg>
      </View>
      {children}
    </View>
  );
}


/** One meal section on Today: name, total, a round + and its food rows. */
export function MealCard({
  label,
  meal,
  date,
  items,
  slots,
  diary,
  planned = [],
  onLogPlanned,
  time,
  onChanged,
  variant = 'card',
  timeGroup,
}: {
  /** By-time meals: this group's time (no meal name shown); its entries are moved/timed together. */
  timeGroup?: { minutes: number | null };
  /** "timeline": a time pill on the dashed line, the meal's totals beside it, and each food as its own card. */
  variant?: 'card' | 'timeline';
  /** Suggested time for this meal (when training has a start time). */
  time?: MealTime;
  /** Planned foods for this meal not eaten yet, with the amount the plan has for them. */
  planned?: { item: PlanItem; grams: number }[];
  onLogPlanned?: (item: PlanItem, grams: number) => void;
  /** Diary-only day: food can be logged without calories. */
  diary?: boolean;
  label: string;
  meal: string;
  date: string;
  items: FoodEntry[];
  /** All meal headings, for "Move to meal". */
  slots: MealSlot[];
  onChanged: () => void;
}) {
  const c = useTheme();
  const total = items.reduce((s, f) => s + f.kcal, 0);
  const plannedKcal = planned.reduce((t, p) => t + (p.item.kcal_100g * p.grams) / 100, 0);
  // A time you set for this meal (the earliest, if its foods differ).
  const setTimes = items.map((f) => f.eaten_at).filter((m): m is number => m != null);
  const setMinutes = setTimes.length ? Math.min(...setTimes) : null;
  const scanInstead = () =>
    router.push({
      pathname: '/scan',
      params: {
        date,
        meal,
        replace: planned.map((p) => p.item.id).join(','),
        planned: planned.map((p) => `${p.item.name} ${amountLabel(p.item, p.grams)}`).join(', '),
        plannedKcal: String(Math.round(plannedKcal)),
        ...timeParam,
      },
    });
  const timeParam = timeGroup?.minutes != null ? { time: String(timeGroup.minutes) } : {};
  const addFood = () =>
    router.push({ pathname: '/food', params: { date, meal, ...timeParam, ...(diary ? { diary: '1' } : {}) } });
  // Set the meal's time or move it (a time group: just its entries).
  const editTime = () =>
    router.push({
      pathname: '/meal-time',
      params: timeGroup ? { date, ids: items.map((f) => f.id).join(',') } : { date, meal },
    });
  const rows = (
    <>
      {items.map((f) => (
        <FoodRow key={f.id} entry={f} slots={slots} onChanged={onChanged} boxed={variant === 'timeline'} />
      ))}
      {planned.map(({ item, grams }) => (
        <PlannedRow
          key={item.id}
          item={item}
          grams={grams}
          onLog={onLogPlanned ? () => onLogPlanned(item, grams) : undefined}
          onChanged={onChanged}
          boxed={variant === 'timeline'}
        />
      ))}
    </>
  );

  if (variant === 'timeline') {
    // The pill: a time group's time; else a time you set, the suggested time (around training),
    // or when the meal was first logged.
    const logged = items.map(eatenMinutes).filter((m): m is number => m != null);
    const minutes = timeGroup
      ? timeGroup.minutes
      : setMinutes != null
        ? setMinutes
        : (time?.minutes ?? (logged.length ? Math.min(...logged) : null));
    const sum = (k: 'protein_g' | 'fat_g' | 'carbs_g') => items.reduce((t, f) => t + (f[k] || 0), 0);
    return (
      <View style={{ gap: Spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: 36 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${minutes != null ? `${timeGroup ? 'Eaten' : label} at ${formatClock(minutes)}` : label}. Set the time${timeGroup ? '' : ' or move this meal'}`}
            onPress={editTime}
            disabled={items.length === 0 && planned.length === 0}
            style={({ pressed }) => ({
              opacity: pressed ? 0.6 : 1,
              minWidth: RAIL,
              height: 34,
              paddingHorizontal: 12,
              borderRadius: 17,
              backgroundColor: time?.tag ? c.trainingBg : c.raised,
              alignItems: 'center',
              justifyContent: 'center',
            })}>
            <Text style={{ color: time?.tag ? c.training : c.text, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
              {minutes != null ? formatClock(minutes) : timeGroup ? 'Planned' : label}
            </Text>
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            {minutes != null && !timeGroup ? (
              <T variant="footnote" numberOfLines={1}>
                {label}
                {time?.tag === 'pre' ? ' · pre' : time?.tag === 'post' ? ' · post' : ''}
              </T>
            ) : null}
          </View>
          {items.length ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Num size="xxs" style={{ fontSize: 15 }}>
                {fmt(total)}
                <Text style={{ fontSize: 12, fontWeight: '600', color: c.text2 }}> kcal</Text>
              </Num>
              <MacroBadge value={sum('protein_g')} letter="P" color={c.protein} />
              <MacroBadge value={sum('fat_g')} letter="F" color={c.fat} />
              <MacroBadge value={sum('carbs_g')} letter="C" color={c.carbs} />
            </View>
          ) : (
            <T variant="footnote" color={c.text3}>
              {planned.length ? `${planned.length} planned · ≈ ${fmt(plannedKcal)} kcal` : 'Nothing yet'}
            </T>
          )}
        </View>
        <View style={{ marginLeft: RAIL, gap: Spacing.sm }}>
          {rows}
          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Add food to ${label}`}
              onPress={addFood}
              style={({ pressed }) => ({
                flex: 1,
                height: 44,
                borderRadius: 14,
                borderWidth: 1.5,
                borderStyle: 'dashed',
                borderColor: c.line,
                backgroundColor: pressed ? c.raised : 'transparent',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              })}>
              <Icon name="plus" size={16} color={c.accentText} strokeWidth={2.4} />
              <Text style={{ color: c.accentText, fontSize: 15, fontWeight: '600' }}>Add food</Text>
            </Pressable>
            {planned.length && onLogPlanned ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Scan what you're eating for ${label} instead of the plan`}
                onPress={scanInstead}
                style={({ pressed }) => ({
                  width: 52,
                  height: 44,
                  borderRadius: 14,
                  borderWidth: 1.5,
                  borderStyle: 'dashed',
                  borderColor: c.line,
                  backgroundColor: pressed ? c.raised : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                })}>
                <Icon name="camera" size={18} color={c.accentText} strokeWidth={2.2} />
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View
      style={{
        backgroundColor: c.surface,
        borderRadius: 20,
        paddingLeft: Spacing.lg,
        paddingRight: Spacing.sm,
        paddingVertical: 4,
        overflow: 'hidden',
        boxShadow: c.e1 === 'none' ? undefined : c.e1,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: 52 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityHint="Set the time or move this meal"
          onPress={editTime}
          disabled={items.length === 0 && planned.length === 0}
          style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.6 : 1 })}>
          <T variant="headline" numberOfLines={1}>
            {label}
          </T>
          {setMinutes != null ? (
            <T variant="footnote" style={{ fontVariant: ['tabular-nums'] }}>
              {formatClock(setMinutes)}
            </T>
          ) : time ? (
            <T variant="footnote" color={time.tag ? c.training : c.text2} style={{ fontVariant: ['tabular-nums'] }}>
              {formatClock(time.minutes)}
              {time.tag === 'pre' ? ' · before training' : time.tag === 'post' ? ' · after training' : ''}
            </T>
          ) : null}
          {items.length === 0 ? (
            <T variant="footnote" color={c.text3}>
              {planned.length ? `${planned.length} planned · ≈ ${fmt(plannedKcal)} kcal` : 'Nothing logged'}
            </T>
          ) : null}
        </Pressable>
        {items.length > 0 ? (
          <Num size="xs" color={c.text2}>
            {fmt(total)} kcal
          </Num>
        ) : null}
        {planned.length && onLogPlanned ? (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={`Scan what you're eating for ${label} instead of the plan`}
            onPress={scanInstead}
            style={{ width: 40, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c.raised, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="camera" size={17} color={c.accentText} strokeWidth={2.2} />
            </View>
          </PressableScale>
        ) : null}
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={`Add food to ${label}`}
          onPress={addFood}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c.raised, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="plus" size={18} color={c.accentText} strokeWidth={2.4} />
          </View>
        </PressableScale>
      </View>
      {rows}
    </View>
  );
}

/** "19 (P)": a meal's grams of one macro, with its letter in a small circle. */
function MacroBadge({ value, letter, color }: { value: number; letter: string; color: string }) {
  const c = useTheme();
  return (
    <View
      accessibilityLabel={`${fmt(value)} grams ${letter === 'P' ? 'protein' : letter === 'F' ? 'fat' : 'carbs'}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Text style={{ color: c.text, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{fmt(value)}</Text>
      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: c.raised, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color, fontSize: 11, fontWeight: '800' }}>{letter}</Text>
      </View>
    </View>
  );
}

function FoodRow({
  entry,
  slots,
  onChanged,
  boxed,
}: {
  entry: FoodEntry;
  slots: MealSlot[];
  onChanged: () => void;
  /** Its own rounded card (timeline), rather than a row in the meal's card. */
  boxed?: boolean;
}) {
  const c = useTheme();

  const run = async (what: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      onChanged();
    } catch (e) {
      Alert.alert(`Could not ${what}`, e instanceof Error ? e.message : String(e));
    }
  };
  const remove = () => run('delete', () => deleteFood(entry.id));
  const confirmDelete = () =>
    Alert.alert('Delete entry?', entry.name, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: remove },
    ]);
  const moveMenu = () =>
    showMenu(
      slots
        .filter((s) => s.key !== entry.meal)
        .map((s) => ({ label: s.label, onPress: () => run('move', () => updateFood(entry.id, { meal: s.key })) })),
      'Move to meal',
    );
  const logAgain = () =>
    run('log again', () => {
      const { id: _id, created_at: _created, ...rest } = entry;
      return addFoodEntry({ ...rest, date: today() });
    });
  const longPress = () =>
    showMenu(
      [
        { label: 'Edit', onPress: () => router.push({ pathname: '/food', params: { id: entry.id } }) },
        { label: 'Move to meal', onPress: moveMenu },
        { label: 'Log again today', onPress: logAgain },
        { label: 'Delete', onPress: confirmDelete, destructive: true },
      ],
      entry.name,
    );

  const meta = `${entry.serving ? `${entry.serving} · ` : ''}P ${fmt(entry.protein_g)} · C ${fmt(entry.carbs_g)} · F ${fmt(entry.fat_g)}`;

  const row = (
    <ReanimatedSwipeable
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      renderRightActions={(_p, _t, methods) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Delete ${entry.name}`}
          onPress={() => {
            methods.close();
            remove();
          }}
          style={{ width: 88, backgroundColor: c.alert, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: c.onAlert, fontSize: 15, fontWeight: '700' }}>Delete</Text>
        </Pressable>
      )}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${entry.name}, ${fmt(entry.kcal)} kcal. ${meta}`}
        accessibilityHint="Opens the entry. Long-press for more."
        onPress={() => router.push({ pathname: '/food', params: { id: entry.id } })}
        onLongPress={longPress}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.md,
          minHeight: 56,
          paddingVertical: 10,
          paddingRight: Spacing.sm,
          ...(boxed ? { paddingLeft: Spacing.lg, paddingRight: Spacing.lg, minHeight: 60 } : { borderTopWidth: 1, borderTopColor: c.line }),
          backgroundColor: pressed ? c.raised : c.surface,
        })}>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {entry.source === 'photo' ? <Icon name="camera" size={14} color={c.text2} strokeWidth={2.2} /> : null}
            <T numberOfLines={1} style={{ flexShrink: 1 }}>
              {entry.name}
            </T>
          </View>
          <T variant="footnote" numberOfLines={1} style={{ fontVariant: ['tabular-nums'] }}>
            {meta}
          </T>
        </View>
        <Num size="xs">{fmt(entry.kcal)}</Num>
      </Pressable>
    </ReanimatedSwipeable>
  );
  return boxed ? (
    <View style={{ borderRadius: 16, overflow: 'hidden', boxShadow: c.e1 === 'none' ? undefined : c.e1 }}>{row}</View>
  ) : (
    row
  );
}

/** A planned food not eaten yet: tick to log it at the planned amount, tap to change the amount first. */
function PlannedRow({
  item,
  grams,
  onLog,
  onChanged,
  boxed,
}: {
  item: PlanItem;
  grams: number;
  onLog?: () => void;
  onChanged: () => void;
  /** Its own card (timeline): dashed, as it isn't eaten yet. */
  boxed?: boolean;
}) {
  const c = useTheme();
  const kcal = Math.round((item.kcal_100g * grams) / 100);
  const changeAmount = () => router.push({ pathname: '/plan-item', params: { id: item.id, planned: String(grams) } });
  // Ate something else instead: take it off today's plan so the rest isn't shrunk to make room for it.
  const remove = async () => {
    try {
      await deletePlanItems([item.id]);
      onChanged();
    } catch (e) {
      Alert.alert('Couldn’t remove it', e instanceof Error ? e.message : String(e));
    }
  };
  const longPress = () =>
    showMenu(
      [
        ...(onLog ? [{ label: `Log ${amountLabel(item, grams)}`, onPress: onLog }] : []),
        { label: 'Change amount', onPress: changeAmount },
        { label: 'Remove from plan (ate something else)', onPress: remove, destructive: true },
      ],
      item.name,
    );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Planned: ${item.name}, ${amountLabel(item, grams)}, ${kcal} kcal. Change amount`}
      accessibilityHint="Long-press for more, such as removing it from the plan."
      onPress={changeAmount}
      onLongPress={longPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        minHeight: 56,
        paddingVertical: 10,
        paddingRight: Spacing.xs,
        ...(boxed
          ? {
              paddingLeft: Spacing.lg,
              paddingRight: Spacing.md,
              minHeight: 60,
              borderRadius: 16,
              borderWidth: 1.5,
              borderStyle: 'dashed' as const,
              borderColor: c.line,
              backgroundColor: c.surface,
            }
          : { borderTopWidth: 1, borderTopColor: c.line }),
        opacity: pressed ? 0.6 : 1,
      })}>
      <View style={{ flex: 1, gap: 2 }}>
        <T numberOfLines={1} color={c.text2}>
          {item.name}
        </T>
        <T variant="footnote" numberOfLines={1} color={c.text3} style={{ fontVariant: ['tabular-nums'] }}>
          Planned · {amountLabel(item, grams)}
        </T>
      </View>
      <Num size="xs" color={c.text2}>
        {fmt(kcal)}
      </Num>
      {onLog ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Log ${item.name}, ${amountLabel(item, grams)}`}
          onPress={onLog}
          hitSlop={6}
          style={({ pressed }) => ({
            width: 32,
            height: 32,
            borderRadius: 16,
            borderWidth: 2,
            borderColor: c.accentLine,
            backgroundColor: pressed ? c.accentBg : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          })}>
          <Icon name="check" size={16} color={c.accentText} strokeWidth={2.6} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}
