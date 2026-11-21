import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { PressableScale } from '@/components/pressable-scale';
import { Num, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Half-width card on Today and Week: overline, a big value and a status line. */
export function Tile({
  overline,
  overlineColor,
  onPress,
  accessibilityLabel,
  children,
}: {
  overline: string;
  overlineColor?: string;
  onPress?: () => void;
  accessibilityLabel?: string;
  children: ReactNode;
}) {
  const c = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => ({
        flex: 1,
        borderRadius: 22,
        padding: 14,
        gap: 4,
        backgroundColor: pressed ? c.raised : c.surface,
        boxShadow: c.e1 === 'none' ? undefined : c.e1,
      })}>
      <Text
        maxFontSizeMultiplier={1.3}
        style={{ fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 0.6, color: overlineColor ?? c.text2 }}>
        {overline.toUpperCase()}
      </Text>
      {children}
    </PressableScale>
  );
}

export type PillTone = 'good' | 'info' | 'plain' | 'training';

/** 28 pt status pill, e.g. "✓ WHOOP confirmed", "Estimate · tap to confirm". */
export function StatusPill({ label, tone }: { label: string; tone: PillTone }) {
  const c = useTheme();
  const bg = { good: c.goodBg, info: c.infoBg, plain: c.raised, training: c.trainingBg }[tone];
  const fg = { good: c.accentText, info: c.info, plain: c.text2, training: c.training }[tone];
  return (
    <View style={{ alignSelf: 'flex-start', height: 28, paddingHorizontal: 10, borderRadius: 14, backgroundColor: bg, justifyContent: 'center' }}>
      <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 12, fontWeight: '600', color: fg }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** A small status line with a coloured dot, as on the tiles. */
export function DotNote({ label, color }: { label: string; color: string }) {
  const c = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
      <T variant="caption" style={{ fontWeight: '400', color: c.text2, flexShrink: 1 }} numberOfLines={2}>
        {label}
      </T>
    </View>
  );
}

/** Dashed "+ Session" style add slot inside a tile. */
export function AddSlot({ label }: { label: string }) {
  const c = useTheme();
  return (
    <View
      style={{
        marginTop: 6,
        alignSelf: 'flex-start',
        height: 28,
        paddingHorizontal: 10,
        borderRadius: 14,
        borderWidth: 1.5,
        borderStyle: 'dashed',
        borderColor: c.text3,
        justifyContent: 'center',
      }}>
      <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 12, fontWeight: '600', color: c.text2 }}>
        {label}
      </Text>
    </View>
  );
}

/** Tiny trend line (140×26) ending in an accent dot. */
export function Sparkline({ values, width = 140, height = 26 }: { values: number[]; width?: number; height?: number }) {
  const c = useTheme();
  if (values.length < 2) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const pad = 4;
  const pts = values.map((v, i) => [
    pad + (i / (values.length - 1)) * (width - pad * 2),
    pad + (1 - (v - lo) / span) * (height - pad * 2),
  ]);
  const d = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const [lx, ly] = pts[pts.length - 1];
  return (
    <Svg width={width} height={height} style={{ marginTop: 2 }}>
      <Path d={d} fill="none" stroke={c.text2} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={lx} cy={ly} r={3.5} fill={c.accentLine} />
    </Svg>
  );
}

/** Value with a quieter unit, e.g. 98.3 kg. */
export function TileValue({ value, unit, color }: { value: string; unit?: string; color?: string }) {
  const c = useTheme();
  return (
    <Text maxFontSizeMultiplier={1.3} numberOfLines={1}>
      <Num size="m" color={color} style={{ fontSize: 24, lineHeight: 28 }}>
        {value}
      </Num>
      {unit ? <Text style={{ fontSize: 14, fontWeight: '500', color: c.text2 }}> {unit}</Text> : null}
    </Text>
  );
}

export const tileGap = Spacing.md;
