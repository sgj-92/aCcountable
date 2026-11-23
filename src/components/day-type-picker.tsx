import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { Card, fmt, Row, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { assignDayType, type DayType } from '@/lib/day-types';
import { activityName } from '@/lib/whoop';

/**
 * "What's today?": pick the day type for a date. Picking one sets the day's target
 * to the agreed numbers, fills the plan with its meals and plans its training.
 */
export function DayTypePicker({
  date,
  dayTypes,
  selectedId,
  onChanged,
  title = 'What’s today?',
}: {
  date: string;
  dayTypes: DayType[];
  selectedId: string | undefined;
  onChanged: () => void;
  title?: string;
}) {
  const c = useTheme();
  const [busy, setBusy] = useState<string | null>(null);
  const selected = dayTypes.find((d) => d.id === selectedId);

  if (dayTypes.length === 0) {
    return (
      <Card hero style={{ gap: 4 }}>
        <T variant="headline">Set up your day types</T>
        <T variant="footnote">
          Save the days you agreed with your coach (“Rest day”, “Padel day”…) with their targets and meals. Then each morning
          you just pick one and your plan is ready.
        </T>
        <PressableScale
          accessibilityRole="button"
          onPress={() => router.push('/day-types')}
          style={{ alignSelf: 'flex-start', paddingVertical: Spacing.sm }}>
          <T color={c.accentText} style={{ fontWeight: '700' }}>
            Set up day types ›
          </T>
        </PressableScale>
      </Card>
    );
  }

  async function pick(dt: DayType | null) {
    if ((dt?.id ?? null) === (selectedId ?? null)) return;
    setBusy(dt?.id ?? 'none');
    try {
      await assignDayType(date, dt);
      if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
      onChanged();
    } catch (e) {
      Alert.alert('Couldn’t set the day', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const training = selected?.sessions.length
    ? selected.sessions.map((s) => `${activityName(s.whoop_activity, s.activity)} ${s.duration_min}′`).join(' + ')
    : 'no training';

  return (
    <Card hero style={{ gap: Spacing.sm, paddingVertical: 14 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T variant="headline">{title}</T>
        <PressableScale accessibilityRole="button" onPress={() => router.push('/day-types')} hitSlop={8}>
          <T variant="footnote" color={c.accentText} style={{ fontWeight: '600' }}>
            Edit day types
          </T>
        </PressableScale>
      </Row>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -Spacing.lg, flexGrow: 0 }}
        contentContainerStyle={{ gap: Spacing.sm, paddingHorizontal: Spacing.lg }}>
        {dayTypes.map((d) => {
          const on = d.id === selectedId;
          return (
            <PressableScale
              key={d.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: on, busy: busy === d.id }}
              accessibilityLabel={`${d.name}, ${fmt(d.kcal)} kcal`}
              onPress={() => pick(d)}
              disabled={!!busy}
              style={({ pressed }) => ({
                minHeight: 52,
                paddingHorizontal: 14,
                paddingVertical: 7,
                borderRadius: 16,
                justifyContent: 'center',
                backgroundColor: on ? c.accent : pressed ? c.pressed : c.raised,
              })}>
              {busy === d.id ? (
                <ActivityIndicator color={on ? c.onAccent : c.accentLine} />
              ) : (
                <>
                  <T style={{ fontWeight: '600' }} color={on ? c.onAccent : c.text} numberOfLines={1}>
                    {d.name}
                  </T>
                  <T variant="caption" style={{ fontWeight: '400', fontVariant: ['tabular-nums'] }} color={on ? c.onAccent : c.text2}>
                    {fmt(d.kcal)} kcal
                  </T>
                </>
              )}
            </PressableScale>
          );
        })}
        {selectedId ? (
          <PressableScale
            accessibilityRole="button"
            onPress={() => pick(null)}
            disabled={!!busy}
            style={{ minHeight: 52, paddingHorizontal: 14, borderRadius: 16, justifyContent: 'center', borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.text3 }}>
            <T variant="footnote" style={{ fontWeight: '600' }}>
              {busy === 'none' ? '…' : 'Clear'}
            </T>
          </PressableScale>
        ) : null}
      </ScrollView>
      <View>
        <T variant="footnote" style={{ fontVariant: ['tabular-nums'] }}>
          {selected
            ? `P ${selected.protein_g} · C ${selected.carbs_g} · F ${selected.fat_g} g · ${training} · ${selected.meals.length} planned foods`
            : 'Pick one and the day’s target, meals and training are filled in.'}
        </T>
      </View>
    </Card>
  );
}
