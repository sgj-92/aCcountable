import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// ───────────── layout ─────────────

export function Screen({
  children,
  padTop = true,
  refreshControl,
}: {
  children: ReactNode;
  padTop?: boolean;
  refreshControl?: React.ComponentProps<typeof ScrollView>['refreshControl'];
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.background }}
      contentContainerStyle={{
        padding: Spacing.lg,
        paddingTop: padTop ? insets.top + Spacing.md : Spacing.lg,
        paddingBottom: insets.bottom + 96,
        gap: Spacing.md,
      }}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}>
      {children}
    </ScrollView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useTheme();
  return (
    <View
      style={[
        { backgroundColor: c.card, borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.sm },
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

type TextVariant = 'title' | 'heading' | 'body' | 'muted' | 'small' | 'big';

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
  const muted = variant === 'muted' || variant === 'small';
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[textStyles[variant], { color: color ?? (muted ? c.textMuted : c.text) }, style]}>
      {children}
    </Text>
  );
}

const textStyles = StyleSheet.create({
  title: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  heading: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 15 },
  muted: { fontSize: 14 },
  small: { fontSize: 12 },
  big: { fontSize: 40, fontWeight: '800', letterSpacing: -1, fontVariant: ['tabular-nums'] },
});

// ───────────── controls ─────────────

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  style,
  icon,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  icon?: string;
}) {
  const c = useTheme();
  const bg =
    variant === 'primary' ? c.primary : variant === 'danger' ? c.danger : variant === 'secondary' ? c.input : 'transparent';
  const fg = variant === 'primary' || variant === 'danger' ? c.primaryText : variant === 'ghost' ? c.primary : c.text;
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderRadius: Radius.md,
          paddingVertical: 13,
          paddingHorizontal: Spacing.lg,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: Spacing.sm,
          opacity: isDisabled ? 0.5 : pressed ? 0.8 : 1,
        },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={{ color: fg, fontSize: 16, fontWeight: '600' }}>
          {icon ? `${icon}  ` : ''}
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  hint,
  style,
  ...props
}: TextInputProps & { label: string; hint?: string; style?: StyleProp<ViewStyle> }) {
  const c = useTheme();
  return (
    <View style={[{ gap: Spacing.xs }, style]}>
      <T variant="small">{label}</T>
      <TextInput
        placeholderTextColor={c.textMuted}
        {...props}
        style={{
          backgroundColor: c.input,
          color: c.text,
          borderRadius: Radius.sm,
          paddingHorizontal: Spacing.md,
          paddingVertical: 11,
          fontSize: 16,
        }}
      />
      {hint ? <T variant="small">{hint}</T> : null}
    </View>
  );
}

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
  return (
    <View style={{ flexDirection: 'row', backgroundColor: c.input, borderRadius: Radius.sm, padding: 3 }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={{
              flex: 1,
              paddingVertical: 8,
              borderRadius: Radius.sm - 2,
              alignItems: 'center',
              backgroundColor: active ? c.card : 'transparent',
            }}>
            <Text style={{ color: active ? c.text : c.textMuted, fontWeight: active ? '600' : '400', fontSize: 14 }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({
  label,
  active,
  onPress,
  color,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  color?: string;
}) {
  const c = useTheme();
  const tint = color ?? c.primary;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={{
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: Radius.pill,
        backgroundColor: active ? tint : c.input,
      }}>
      <Text style={{ color: active ? c.primaryText : c.text, fontSize: 13, fontWeight: active ? '600' : '500' }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ProgressBar({
  value,
  max,
  color,
  height = 8,
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
          width: `${Math.min(1, ratio) * 100}%`,
          height: '100%',
          backgroundColor: over ? c.danger : (color ?? c.primary),
          borderRadius: height / 2,
        }}
      />
    </View>
  );
}

export function Stepper({ label, onPrev, onNext }: { label: string; onPrev: () => void; onNext: () => void }) {
  const c = useTheme();
  const btn = (txt: string, onPress: () => void, a11y: string) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      hitSlop={12}
      style={{ paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs }}>
      <Text style={{ color: c.primary, fontSize: 22, fontWeight: '600' }}>{txt}</Text>
    </Pressable>
  );
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      {btn('‹', onPrev, 'Previous')}
      <T variant="heading">{label}</T>
      {btn('›', onNext, 'Next')}
    </Row>
  );
}

export function Loading() {
  const c = useTheme();
  return (
    <View style={{ padding: Spacing.xl, alignItems: 'center' }}>
      <ActivityIndicator color={c.primary} />
    </View>
  );
}

export function ErrorText({ message }: { message: string | null | undefined }) {
  const c = useTheme();
  if (!message) return null;
  return <T color={c.danger}>{message}</T>;
}

export function Divider() {
  const c = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border }} />;
}

export const fmt = (n: number) => Math.round(n).toLocaleString();
