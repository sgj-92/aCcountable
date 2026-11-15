import { Chip, Row } from '@/components/ui';
import { useMealSlots } from '@/hooks/use-profile';
import { slotsForData, type MealKey } from '@/lib/meals';

/** Pick which meal something belongs to, using the person's meal names. */
export function MealPicker({ value, onChange }: { value: MealKey; onChange: (m: MealKey) => void }) {
  // Include the current value even if that meal is no longer configured.
  const slots = slotsForData(useMealSlots(), [value]);
  return (
    <Row style={{ flexWrap: 'wrap' }}>
      {slots.map((s) => (
        <Chip key={s.key} label={s.label} active={value === s.key} onPress={() => onChange(s.key)} />
      ))}
    </Row>
  );
}
