import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useEffect } from 'react';
import { Platform, StyleSheet, Text } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { showMenu } from '@/components/menu';
import { PressableScale } from '@/components/pressable-scale';
import { Spacing } from '@/constants/theme';
import { useTheme, useThemeMode } from '@/hooks/use-theme';

/** Height of the system tab bar plus a 12 pt gap: the dock floats just above it. */
// Native tabs draw over the screen, so the dock sits above them; web tabs sit beside or below it.
const ABOVE_TAB_BAR = Platform.OS === 'web' ? 16 : 62 + 12;
const WEB = Platform.OS === 'web';
const GLASS = isLiquidGlassAvailable();

/**
 * Floating quick-log bar on Today: Scan meal, Add food, and + for a session or weigh-in.
 * See-through (Liquid Glass on iOS 26, translucent elsewhere) and slides away while you scroll.
 */
export function QuickDock({
  hidden,
  onScan,
  onAddFood,
  onLogSession,
  onWeighIn,
  onLogDay,
}: {
  /** Describe the day so far and log it all at once with AI. */
  onLogDay?: () => void;
  hidden?: boolean;
  onScan: () => void;
  onAddFood: () => void;
  onLogSession: () => void;
  onWeighIn: () => void;
}) {
  const c = useTheme();
  const { scheme } = useThemeMode();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const away = 66 + insets.bottom + ABOVE_TAB_BAR;
  const shift = useSharedValue(0);
  useEffect(() => {
    const to = hidden ? away : 0;
    shift.set(reduceMotion ? to : withTiming(to, { duration: 220, easing: Easing.out(Easing.cubic) }));
  }, [hidden, away, reduceMotion, shift]);
  const slide = useAnimatedStyle(() => ({
    transform: [{ translateY: shift.get() }],
    opacity: 1 - Math.min(1, shift.get() / 80),
  }));
  // Secondary buttons are tinted, not solid, so the bar stays see-through.
  const soft = scheme === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(17,19,14,0.06)';
  const softPressed = scheme === 'dark' ? 'rgba(255,255,255,0.18)' : 'rgba(17,19,14,0.12)';

  return (
    <Animated.View
      accessibilityRole="toolbar"
      accessibilityLabel="Quick log"
      pointerEvents={hidden ? 'none' : 'box-none'}
      style={[
        {
          position: 'absolute',
          left: Spacing.lg,
          right: Spacing.lg,
          bottom: insets.bottom + ABOVE_TAB_BAR,
          // Centred under the content column in a wide browser window.
          ...(WEB ? { maxWidth: 688, marginHorizontal: 'auto' as const } : null),
          height: 66,
          borderRadius: 33,
          overflow: 'hidden',
          borderWidth: GLASS ? 0 : 1,
          borderColor: c.floatBorder,
          backgroundColor: GLASS ? 'transparent' : scheme === 'dark' ? 'rgba(33,36,31,0.72)' : 'rgba(255,255,255,0.72)',
        },
        slide,
      ]}>
      {GLASS ? <GlassView style={StyleSheet.absoluteFill} glassEffectStyle="regular" isInteractive /> : null}
      <Animated.View style={{ flex: 1, flexDirection: 'row', gap: 6, padding: 7 }}>
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
            backgroundColor: pressed ? softPressed : soft,
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
          accessibilityLabel="More: log your day, a session or weight"
          onPress={() =>
            showMenu([
              ...(onLogDay ? [{ label: 'Log your day with AI', onPress: onLogDay }] : []),
              { label: 'Log session', onPress: onLogSession },
              { label: 'Weigh in', onPress: onWeighIn },
            ])
          }
          style={({ pressed }) => ({
            width: 52,
            height: 52,
            borderRadius: 26,
            backgroundColor: pressed ? softPressed : soft,
            alignItems: 'center',
            justifyContent: 'center',
          })}>
          <Icon name="plus" size={22} color={c.text} strokeWidth={2.3} />
        </PressableScale>
      </Animated.View>
    </Animated.View>
  );
}
