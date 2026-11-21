import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// ───────────── layout ─────────────

export function Screen({
  children,
  padTop = true,
  padBottom,
  refreshControl,
}: {
  children: ReactNode;
  padTop?: boolean;
  /** Extra room at the bottom, e.g. 200 on Today to clear the floating dock. */
  padBottom?: number;
  refreshControl?: React.ComponentProps<typeof ScrollView>['refreshControl'];
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{
        padding: Spacing.lg,
        paddingTop: padTop ? insets.top + Spacing.md : Spacing.lg,
        paddingBottom: padBottom ?? insets.bottom + 96,
        gap: Spacing.md,
      }}
      keyboardShouldPersistTaps="handled"
      // We pad for the safe area ourselves; without this, iOS adds its own inset to the first
      // tab's scroll view as well, so that tab started lower than the others.
      contentInsetAdjustmentBehavior="never"
      automaticallyAdjustContentInsets={false}
      // Make room for the keyboard and keep the focused text box above it (iOS); drag down to dismiss.
      automaticallyAdjustKeyboardInsets
      keyboardDismissMode="interactive"
      refreshControl={refreshControl}>
      {children}
    </ScrollView>
  );
}

/** Flat in dark mode (surfaces step up in lightness); one soft shadow in light mode. */
export function Card({
  children,
  style,
  hero,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Radius 24 for the main card on a screen. */
  hero?: boolean;
}) {
  const c = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: c.surface,
          borderRadius: hero ? Radius.hero : 20,
          padding: Spacing.lg,
          gap: Spacing.sm,
          boxShadow: c.e1 === 'none' ? undefined : c.e1,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

export function Row({
  children,
  style,
  gap = Spacing.sm,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  gap?: number;
}) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

// ───────────── text ─────────────

type TextVariant =
  | 'largeTitle'
  | 'title'
  | 'headline'
  | 'heading'
  | 'body'
  | 'muted'
  | 'footnote'
  | 'small'
  | 'caption'
  | 'overline'
  | 'big';

const MUTED: TextVariant[] = ['muted', 'footnote', 'small', 'caption', 'overline'];

/** Words in SF Pro. `heading` = headline, `small` = footnote, `big` = a 40 pt Archivo number. */
export function T({
  children,
  variant = 'body',
  color,
  style,
  numberOfLines,
}: {
  children: ReactNode;
  variant?: TextVariant;
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const c = useTheme();
  return (
    <Text
      numberOfLines={numberOfLines}
      maxFontSizeMultiplier={variant === 'big' ? 1.3 : undefined}
      style={[textStyles[variant], { color: color ?? (MUTED.includes(variant) ? c.text2 : c.text) }, style]}>
      {children}
    </Text>
  );
}

const textStyles = StyleSheet.create({
  largeTitle: Type.largeTitle,
  title: Type.largeTitle,
  headline: Type.headline,
  heading: Type.headline,
  body: Type.body,
  muted: { fontSize: 14, lineHeight: 19 },
  footnote: Type.footnote,
  small: Type.footnote,
  caption: Type.caption,
  overline: Type.overline,
  big: { ...Type.numXL, fontVariant: ['tabular-nums'] },
});

type NumSize = 'display' | 'hero' | 'xl' | 'l' | 'm' | 's' | 'xs' | 'xxs';

const NUM_STYLE = {
  display: Type.numDisplay,
  hero: Type.numHero,
  xl: Type.numXL,
  l: Type.numL,
  m: Type.numM,
  s: Type.numS,
  xs: Type.numXS,
  xxs: Type.numXXS,
} as const;

/** Numbers: Archivo, tabular figures, capped at 1.3× Dynamic Type so layouts hold. */
export function Num({
  children,
  size = 's',
  color,
  style,
  numberOfLines,
}: {
  children: ReactNode;
  size?: NumSize;
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const c = useTheme();
  return (
    <Text
      numberOfLines={numberOfLines}
      maxFontSizeMultiplier={1.3}
      style={[NUM_STYLE[size], { fontVariant: ['tabular-nums'], color: color ?? c.text }, style]}>
      {children}
    </Text>
  );
}

// ───────────── controls ─────────────

type ButtonSize = 'L' | 'M' | 'S';

const BUTTON_SIZE = {
  L: { height: 56, radius: Radius.lg, font: 16, weight: '700', pad: Spacing.xl, hitSlop: 0 },
  M: { height: 44, radius: Radius.md, font: 15, weight: '600', pad: Spacing.lg, hitSlop: 0 },
  S: { height: 32, radius: 16, font: 13, weight: '700', pad: Spacing.md, hitSlop: 6 },
} as const;

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'M',
  loading,
  disabled,
  style,
  icon,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  icon?: string;
}) {
  const c = useTheme();
  const s = BUTTON_SIZE[size];
  const fill = {
    primary: [c.accent, c.accentPressed],
    danger: [c.alert, c.alertPressed],
    secondary: [c.raised, c.pressed],
    ghost: ['transparent', c.raised],
  }[variant];
  const fg = { primary: c.onAccent, danger: c.onAlert, secondary: c.text, ghost: c.accentText }[variant];
  const isDisabled = disabled || loading;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      onPress={onPress}
      disabled={isDisabled}
      hitSlop={s.hitSlop}
      style={({ pressed }) => [
        {
          minHeight: s.height,
          backgroundColor: pressed ? fill[1] : fill[0],
          borderRadius: s.radius,
          paddingHorizontal: variant === 'ghost' ? Spacing.sm : s.pad,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: Spacing.sm,
          opacity: disabled ? 0.4 : 1,
        },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={{ color: fg, fontSize: s.font, fontWeight: s.weight }} numberOfLines={1}>
          {icon ? `${icon}  ` : ''}
          {title}
        </Text>
      )}
    </PressableScale>
  );
}

/** A 44 pt round button with a glyph, e.g. the ‹ › day arrows. */
export function IconButton({
  glyph,
  onPress,
  label,
  disabled,
  size = 44,
  color,
  background,
}: {
  glyph: string;
  onPress: () => void;
  label: string;
  disabled?: boolean;
  size?: number;
  color?: string;
  background?: string;
}) {
  const c = useTheme();
  const hit = Math.max(0, (44 - size) / 2);
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      hitSlop={hit}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: background ?? (pressed ? c.pressed : c.raised),
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
      })}>
      <Text style={{ color: color ?? c.text, fontSize: size >= 40 ? 22 : 18, fontWeight: '600', marginTop: -2 }}>
        {glyph}
      </Text>
    </PressableScale>
  );
}

export function Field({
  label,
  hint,
  error,
  style,
  onFocus,
  onBlur,
  ...props
}: TextInputProps & {
  label: string;
  hint?: string;
  /** Shows a red ring and this message under the field. */
  error?: string | null;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useTheme();
  const [focused, setFocused] = useState(false);
  const disabled = props.editable === false;
  const ring = error ? c.alert : focused ? c.accentLine : 'transparent';
  return (
    <View style={[{ gap: 6, opacity: disabled ? 0.4 : 1 }, style]}>
      <T variant="footnote">{label}</T>
      <TextInput
        placeholderTextColor={c.text3}
        selectionColor={c.accentLine}
        accessibilityLabel={label}
        {...props}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={{
          minHeight: 52,
          backgroundColor: c.raised,
          color: c.text,
          borderRadius: Radius.md,
          borderWidth: 2,
          borderColor: ring,
          paddingHorizontal: 14,
          paddingVertical: props.multiline ? 12 : 0,
          fontSize: 17,
          textAlignVertical: props.multiline ? 'top' : 'center',
        }}
      />
      {error ? (
        <T variant="footnote" color={c.alert}>
          {error}
        </T>
      ) : hint ? (
        <T variant="footnote">{hint}</T>
      ) : null}
    </View>
  );
}

/** 40 pt track, thumb slides 220 ms. */
export function Segmented<V extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: V }[];
  value: V;
  onChange: (v: V) => void;
}) {
  const c = useTheme();
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const PAD = 3;
  const n = options.length;
  const thumbW = width > 0 ? (width - PAD * 2 - PAD * (n - 1)) / n : 0;
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const target = index * (thumbW + PAD);
  const thumbStyle = useAnimatedStyle(
    () => ({
      transform: [
        {
          translateX: reduceMotion
            ? target
            : withTiming(target, { duration: 220, easing: Easing.out(Easing.cubic) }),
        },
      ],
    }),
    [target, reduceMotion],
  );

  return (
    <View
      accessibilityRole="radiogroup"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ flexDirection: 'row', height: 40, backgroundColor: c.raised, borderRadius: 12, padding: PAD, gap: PAD }}>
      {thumbW > 0 && options.some((o) => o.value === value) ? (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: PAD,
              bottom: PAD,
              left: PAD,
              width: thumbW,
              borderRadius: 9,
              backgroundColor: c.thumb,
              boxShadow: c.e1 === 'none' ? undefined : '0px 1px 3px rgba(17,19,14,0.15)',
            },
            thumbStyle,
          ]}
        />
      ) : null}
      {options.map((o) => {
        const active = o.value === value;
        return (
          <PressableScale
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={{ flex: 1, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }}>
            <Text
              numberOfLines={1}
              style={{ color: active ? c.text : c.text2, fontWeight: active ? '600' : '400', fontSize: 14 }}>
              {o.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

/**
 * 36 pt pill. Selected = accent fill (or `color` fill, e.g. training).
 * kind "session" = training tint for a logged session; "add" = dashed outline for an empty slot.
 */
export function Chip({
  label,
  active,
  onPress,
  color,
  kind = 'default',
  disabled,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  color?: string;
  kind?: 'default' | 'session' | 'add';
  disabled?: boolean;
}) {
  const c = useTheme();
  let bg: string = c.raised;
  let fg: string = c.text;
  let weight: TextStyle['fontWeight'] = '500';
  if (kind === 'session') {
    bg = c.trainingBg;
    fg = c.training;
    weight = '600';
  } else if (kind === 'add') {
    bg = 'transparent';
    fg = c.text2;
  } else if (active) {
    bg = color ?? c.accent;
    fg = color ? c.bg : c.onAccent;
    weight = '600';
  }
  return (
    <PressableScale
      onPress={onPress}
      disabled={!onPress || disabled}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={{ selected: !!active, disabled: !!disabled }}
      hitSlop={4}
      style={({ pressed }) => ({
        height: 36,
        paddingHorizontal: 14,
        borderRadius: 18,
        justifyContent: 'center',
        backgroundColor: pressed && kind === 'default' && !active ? c.pressed : bg,
        borderWidth: kind === 'add' ? 1.5 : 0,
        borderStyle: kind === 'add' ? 'dashed' : 'solid',
        borderColor: c.text3,
        opacity: disabled ? 0.4 : 1,
      })}>
      <Text style={{ color: fg, fontSize: 15, fontWeight: weight }} numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
}

/** Bar height 6, radius 3. Turns alert past the max. */
export function ProgressBar({
  value,
  max,
  color,
  height = 6,
}: {
  value: number;
  max: number;
  color?: string;
  height?: number;
}) {
  const c = useTheme();
  const ratio = max > 0 ? value / max : 0;
  const over = ratio > 1;
  return (
    <View style={{ height, backgroundColor: c.track, borderRadius: height / 2, overflow: 'hidden' }}>
      <View
        style={{
          width: `${Math.max(0, Math.min(1, ratio)) * 100}%`,
          height: '100%',
          backgroundColor: over ? c.alert : (color ?? c.accentLine),
          borderRadius: height / 2,
        }}
      />
    </View>
  );
}

/** ‹ label › with 44 pt round arrows. `nextDisabled` greys the forward arrow (e.g. future weigh-ins). */
export function Stepper({
  label,
  onPrev,
  onNext,
  nextDisabled,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
}) {
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <IconButton glyph="‹" label="Previous" onPress={onPrev} />
      <T variant="headline" style={{ flex: 1, textAlign: 'center' }} numberOfLines={1}>
        {label}
      </T>
      <IconButton glyph="›" label="Next" onPress={onNext} disabled={nextDisabled} />
    </Row>
  );
}

export function Loading() {
  const c = useTheme();
  return (
    <View style={{ padding: Spacing.xl, alignItems: 'center' }}>
      <ActivityIndicator color={c.accentLine} />
    </View>
  );
}

export function ErrorText({ message }: { message: string | null | undefined }) {
  const c = useTheme();
  if (!message) return null;
  return (
    <T variant="footnote" color={c.alert}>
      {message}
    </T>
  );
}

export function Divider() {
  const c = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.line }} />;
}

export const fmt = (n: number) => Math.round(n).toLocaleString();
