import { router } from 'expo-router';
import { Alert, Pressable, Text, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import { Icon } from '@/components/icon';
import { showMenu } from '@/components/menu';
import { PressableScale } from '@/components/pressable-scale';
import { fmt, Num, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { addFoodEntry, deleteFood, updateFood, type FoodEntry } from '@/lib/api';
import { today } from '@/lib/dates';
import type { MealSlot } from '@/lib/meals';

/** One meal section on Today: name, total, a round + and its food rows. */
export function MealCard({
  label,
  meal,
  date,
  items,
  slots,
  onChanged,
}: {
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
        <View style={{ flex: 1 }}>
          <T variant="headline" numberOfLines={1}>
            {label}
          </T>
          {items.length === 0 ? (
            <T variant="footnote" color={c.text3}>
              Nothing logged
            </T>
          ) : null}
        </View>
        {items.length > 0 ? (
          <Num size="xs" color={c.text2}>
            {fmt(total)} kcal
          </Num>
        ) : null}
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={`Add food to ${label}`}
          onPress={() => router.push({ pathname: '/food', params: { date, meal } })}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c.raised, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="plus" size={18} color={c.accentText} strokeWidth={2.4} />
          </View>
        </PressableScale>
      </View>
      {items.map((f) => (
        <FoodRow key={f.id} entry={f} slots={slots} onChanged={onChanged} />
      ))}
    </View>
  );
}

function FoodRow({ entry, slots, onChanged }: { entry: FoodEntry; slots: MealSlot[]; onChanged: () => void }) {
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

  return (
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
          borderTopWidth: 1,
          borderTopColor: c.line,
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
}
