import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Keyboard, Platform, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { Chip, fmt, IconButton, Num, Row, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { countLabel } from '@/lib/foods';
import { useTheme } from '@/hooks/use-theme';

/** Height of the keyboard while it is open (0 when closed). */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) =>
      setHeight(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}

/** Space a sheet's scroll content needs at the bottom so the pinned footer never covers it. */
export const FOOTER_SPACE = 44 + Spacing.md * 2 + 34;

/**
 * Primary action pinned to the bottom of a sheet, above the home indicator.
 * Hairline + background so content scrolls under it; rides up with the keyboard.
 */
export function SheetFooter({ children }: { children: ReactNode }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: keyboard,
        paddingHorizontal: Spacing.lg,
        paddingTop: Spacing.md,
        paddingBottom: keyboard > 0 ? Spacing.md : Math.max(insets.bottom, Spacing.md),
        backgroundColor: c.bg,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: c.line,
        gap: Spacing.sm,
      }}>
      {children}
    </View>
  );
}

/** 12 pt AI confidence marker: filled = high, half = medium, hollow = low (shape, not only colour). */
export function ConfidenceDot({ level, size = 12 }: { level: 'low' | 'medium' | 'high'; size?: number }) {
  const c = useTheme();
  const r = size / 2 - 1;
  const m = size / 2;
  const color = level === 'high' ? c.good : c.warn;
  return (
    <Svg width={size} height={size} accessibilityLabel={`${level} confidence`}>
      <Circle cx={m} cy={m} r={r} stroke={color} strokeWidth={1.5} fill={level === 'high' ? color : 'none'} />
      {level === 'medium' ? <Path d={`M${m} ${m - r} A${r} ${r} 0 0 0 ${m} ${m + r} Z`} fill={color} /> : null}
    </Svg>
  );
}

/** Overline 12/700 caps, optionally with a small badge, e.g. WHOLE FOODS · USDA. */
export function Overline({ children, badge, color }: { children: string; badge?: string; color?: string }) {
  const c = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: 4 }}>
      <Text
        maxFontSizeMultiplier={1.3}
        style={{ fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 0.8, color: color ?? c.text2 }}>
        {children.toUpperCase()}
      </Text>
      {badge ? <SourceBadge label={badge} /> : null}
    </View>
  );
}

export function SourceBadge({ label }: { label: string }) {
  const c = useTheme();
  return (
    <View style={{ height: 20, paddingHorizontal: 8, borderRadius: Radius.sm, backgroundColor: c.raised, justifyContent: 'center' }}>
      <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 11, fontWeight: '600', color: c.text2 }}>
        {label}
      </Text>
    </View>
  );
}

/** The big grams input: 80 pt, Archivo 40, focus ring, live kcal on the right. */
export function GramsField({
  value,
  onChangeText,
  kcal,
  unit = 'g',
  autoFocus,
  error,
  height = 80,
  ...props
}: Omit<TextInputProps, 'style'> & {
  value: string;
  onChangeText: (v: string) => void;
  kcal?: number;
  unit?: string;
  /** Turns the ring alert (show the message with ErrorText). */
  error?: boolean;
  height?: number;
}) {
  const c = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View
      style={{
        height,
        borderRadius: Radius.lg,
        backgroundColor: c.raised,
        borderWidth: 2,
        borderColor: error ? c.alert : focused ? c.accentLine : 'transparent',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 18,
        gap: 6,
      }}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        selectTextOnFocus
        autoFocus={autoFocus}
        accessibilityLabel={`Amount in ${unit === 'g' ? 'grams' : unit}`}
        selectionColor={c.accentLine}
        maxFontSizeMultiplier={1.3}
        {...props}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        style={{
          fontFamily: 'Archivo_800ExtraBold',
          fontSize: height >= 72 ? 40 : 32,
          color: c.text,
          minWidth: 60,
          padding: 0,
          fontVariant: ['tabular-nums'],
        }}
      />
      <Text style={{ fontSize: 20, color: c.text2 }}>{unit}</Text>
      <View style={{ flex: 1 }} />
      {kcal != null ? (
        <Num size="s" style={{ fontFamily: 'Archivo_800ExtraBold' }}>
          {Math.round(kcal).toLocaleString()} kcal
        </Num>
      ) : null}
    </View>
  );
}

/** Quick amounts under the grams field. */
export function ServingChips({
  options,
  grams,
  onPick,
}: {
  options: { label: string; grams: number }[];
  grams: number;
  onPick: (g: number) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
      {options.map((o) => (
        <Chip key={o.label} label={o.label} active={Math.abs(grams - o.grams) < 0.01} onPress={() => onPick(o.grams)} />
      ))}
    </View>
  );
}

/** ✕ on the left of a sheet's native header. */
export function SheetClose() {
  const c = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel="Close"
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: pressed ? c.pressed : c.raised,
        alignItems: 'center',
        justifyContent: 'center',
      })}>
      <Icon name="close" size={16} color={c.text2} strokeWidth={2.4} />
    </PressableScale>
  );
}

/** − 2 muffins + : pieces in half steps; grams follow the unit's estimated weight. */
export function CountStepper({
  unit,
  grams,
  onChange,
}: {
  unit: { name: string; grams: number };
  grams: number;
  onChange: (grams: number) => void;
}) {
  const c = useTheme();
  const count = Math.round((grams / unit.grams) * 2) / 2;
  const step = (d: number) => {
    const next = Math.max(0.5, count + d);
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    onChange(next * unit.grams);
  };
  return (
    <Row
      style={{ height: 72, borderRadius: Radius.lg, backgroundColor: c.raised, paddingHorizontal: Spacing.sm, justifyContent: 'space-between' }}>
      <IconButton glyph="−" label={`One less ${unit.name}`} onPress={() => step(-0.5)} disabled={count <= 0.5} background={c.surface} />
      <View style={{ alignItems: 'center' }}>
        <Num size="l">{countLabel(count, unit.name)}</Num>
        <T variant="caption" style={{ fontWeight: '400' }}>
          about {fmt(unit.grams)} g each
        </T>
      </View>
      <IconButton glyph="+" label={`One more ${unit.name}`} onPress={() => step(0.5)} background={c.surface} />
    </Row>
  );
}
