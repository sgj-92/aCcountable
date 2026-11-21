import { ScrollView } from 'react-native';

import { Chip } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useMealSlots } from '@/hooks/use-profile';
import { slotsForData, type MealKey } from '@/lib/meals';

/** Pick which meal something belongs to: a row of chips that scrolls and bleeds off the right edge. */
export function MealPicker({ value, onChange }: { value: MealKey; onChange: (m: MealKey) => void }) {
  // Include the current value even if that meal is no longer configured.
  const slots = slotsForData(useMealSlots(), [value]);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={{ marginRight: -Spacing.lg, flexGrow: 0 }}
      contentContainerStyle={{ gap: Spacing.sm, paddingRight: Spacing.lg }}>
      {slots.map((s) => (
        <Chip key={s.key} label={s.label} active={value === s.key} onPress={() => onChange(s.key)} />
      ))}
    </ScrollView>
  );
}
