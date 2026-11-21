import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { showMenu } from '@/components/menu';
import { PressableScale } from '@/components/pressable-scale';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Height of the system tab bar plus a 12 pt gap: the dock floats just above it. */
const ABOVE_TAB_BAR = 62 + 12;

/** Floating quick-log bar on Today: Scan meal, Add food, and + for a session or weigh-in. */
export function QuickDock({
  onScan,
  onAddFood,
  onLogSession,
  onWeighIn,
}: {
  onScan: () => void;
  onAddFood: () => void;
  onLogSession: () => void;
  onWeighIn: () => void;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityRole="toolbar"
      accessibilityLabel="Quick log"
      style={{
        position: 'absolute',
        left: Spacing.lg,
        right: Spacing.lg,
        bottom: insets.bottom + ABOVE_TAB_BAR,
        height: 66,
        padding: 7,
        borderRadius: 33,
        flexDirection: 'row',
        gap: 6,
        backgroundColor: c.floatBg,
        borderWidth: 1,
        borderColor: c.floatBorder,
        boxShadow: c.e2,
      }}>
      <PressableScale
        accessibilityRole="button"
        onPress={onScan}
        style={({ pressed }) => ({
          flex: 1.4,
          height: 52,
          borderRadius: 26,
          backgroundColor: pressed ? c.accentPressed : c.accent,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: Spacing.sm,
        })}>
        <Icon name="camera" size={20} color={c.onAccent} strokeWidth={2.1} />
        <Text maxFontSizeMultiplier={1.3} style={{ color: c.onAccent, fontSize: 16, fontWeight: '700' }}>
          Scan meal
        </Text>
      </PressableScale>
      <PressableScale
        accessibilityRole="button"
        onPress={onAddFood}
        style={({ pressed }) => ({
          flex: 1,
          height: 52,
          borderRadius: 26,
          backgroundColor: pressed ? c.pressed : c.raised,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        })}>
        <Icon name="search" size={18} color={c.text} strokeWidth={2.1} />
        <Text maxFontSizeMultiplier={1.3} style={{ color: c.text, fontSize: 15, fontWeight: '600' }}>
          Add food
        </Text>
      </PressableScale>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="More: log a session or weight"
        onPress={() =>
          showMenu([
            { label: 'Log session', onPress: onLogSession },
            { label: 'Weigh in', onPress: onWeighIn },
          ])
        }
        style={({ pressed }) => ({
          width: 52,
          height: 52,
          borderRadius: 26,
          backgroundColor: pressed ? c.pressed : c.raised,
          alignItems: 'center',
          justifyContent: 'center',
        })}>
        <Icon name="plus" size={22} color={c.text} strokeWidth={2.3} />
      </PressableScale>
    </View>
  );
}
