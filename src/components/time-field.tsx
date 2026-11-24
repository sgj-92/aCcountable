import { View } from 'react-native';

import { Chip, Field, Row } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { formatClock, formatClockInput, parseClock } from '@/lib/fasting';

/**
 * "Time eaten" as HH:MM, with a Now chip. `value` is the typed text; empty means "now"
 * (when it's logged). Use `minutesOf(text)` to read it.
 */
export function TimeField({
  value,
  onChange,
  label = 'Time eaten',
  emptyLabel = 'Now',
}: {
  value: string;
  onChange: (text: string) => void;
  label?: string;
  emptyLabel?: string;
}) {
  const now = new Date();
  const nowText = formatClock(now.getHours() * 60 + now.getMinutes());
  const invalid = value.trim() !== '' && parseClock(value) == null;
  return (
    <View style={{ gap: Spacing.sm }}>
      <Row gap={Spacing.sm} style={{ alignItems: 'flex-end' }}>
        <Field
          style={{ flex: 1 }}
          label={label}
          placeholder={`${emptyLabel} (${nowText})`}
          value={value}
          onChangeText={(t) => onChange(formatClockInput(t))}
          keyboardType="number-pad"
          maxLength={5}
          invalid={invalid}
          error={invalid ? 'Use HH:MM, e.g. 13:30' : undefined}
        />
        <Chip label="Now" active={value.trim() === ''} onPress={() => onChange('')} />
      </Row>
    </View>
  );
}

/** Minutes after midnight from a TimeField's text; null for empty or invalid. */
export function minutesOf(text: string): number | null {
  return text.trim() === '' ? null : parseClock(text);
}
