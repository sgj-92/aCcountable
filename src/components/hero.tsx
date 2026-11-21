import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { fmt, Num, ProgressBar, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { WeekDay } from '@/lib/weekly';
import type { WeekSummary } from '@/lib/week-summary';

/** base · training · week balance | target */
export function TargetLedger({
  base,
  training,
  trainingLabel,
  weekBalance,
  target,
}: {
  base: number;
  training: number;
  /** e.g. "padel"; shown under the training figure. */
  trainingLabel: string;
  weekBalance: number;
  target: number;
}) {
  const c = useTheme();
  const signed = (n: number) => (Math.round(n) === 0 ? '0' : `${n < 0 ? '−' : '+'}${fmt(Math.abs(n))}`);
  const cell = (value: string, label: string, color?: string, heavy?: boolean, divider?: boolean) => (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        gap: 1,
        borderLeftWidth: divider ? 1 : 0,
        borderLeftColor: c.line,
      }}>
      <Num size="s" color={color} style={heavy ? { fontFamily: 'Archivo_800ExtraBold' } : undefined} numberOfLines={1}>
        {value}
      </Num>
      <T variant="caption" style={{ fontWeight: '400' }} numberOfLines={1}>
        {label}
      </T>
    </View>
  );
  return (
    <View
      accessible
      accessibilityLabel={`Base ${fmt(base)}, training ${signed(training)}, week balance ${signed(weekBalance)}, target ${fmt(target)}`}
      style={{ flexDirection: 'row', gap: 4, alignSelf: 'stretch' }}>
      {cell(fmt(base), 'base')}
      {training > 0
        ? cell(`+${fmt(training)}`, trainingLabel, c.training)
        : cell('0', 'rest day', c.text3)}
      {cell(signed(weekBalance), 'week balance')}
      {cell(fmt(target), 'target', undefined, true, true)}
    </View>
  );
}

export interface MacroBar {
  label: string;
  value: number;
  target: number;
  color: string;
}

/** Protein · Carbs · Fat: what's left, a bar, and value / target. */
export function MacroBars({ macros }: { macros: MacroBar[] }) {
  const c = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 14, alignSelf: 'stretch' }}>
      {macros.map((m) => {
        const left = m.target - m.value;
        const over = left < 0;
        return (
          <View
            key={m.label}
            style={{ flex: 1, gap: 5 }}
            accessible
            accessibilityLabel={`${m.label} ${fmt(m.value)} of ${fmt(m.target)} grams, ${fmt(Math.abs(left))} ${over ? 'over' : 'left'}`}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
              {/* The bar carries the colour; no key dot, so "Protein 117 left" fits a third of the card. */}
              <T variant="caption" numberOfLines={1} style={{ flexShrink: 0 }}>
                {m.label}
              </T>
              <Text
                maxFontSizeMultiplier={1.3}
                numberOfLines={1}
                style={{ flexShrink: 1, fontSize: 12, lineHeight: 16, fontWeight: '600', color: over ? c.alert : c.text2, fontVariant: ['tabular-nums'] }}>
                {over ? `+${fmt(-left)} over` : `${fmt(left)} left`}
              </Text>
            </View>
            <ProgressBar value={m.value} max={m.target} color={m.color} />
            <Text maxFontSizeMultiplier={1.3} numberOfLines={1}>
              <Num size="xxs" color={over ? c.alert : c.text} style={{ fontSize: 14 }}>
                {fmt(m.value)}
              </Num>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text2 }}> / {fmt(m.target)} g</Text>
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const BAR_H = 36;

function WeekBar({
  day,
  index,
  scale,
  viewed,
}: {
  day: WeekDay;
  index: number;
  scale: number;
  viewed: boolean;
}) {
  const c = useTheme();
  const reduceMotion = useReducedMotion();
  const future = day.status === 'future';
  const isToday = day.status === 'today';
  const over = day.status !== 'future' && day.eaten > day.adjusted && day.eaten > 0;
  const fillH = Math.round((Math.min(day.eaten, scale) / scale) * BAR_H);
  const tickB = Math.min(BAR_H - 2, Math.round((day.adjusted / scale) * BAR_H));
  const h = useSharedValue(reduceMotion ? fillH : 0);
  useEffect(() => {
    h.set(
      reduceMotion
        ? fillH
        : withDelay(index * 30, withTiming(fillH, { duration: 500, easing: Easing.out(Easing.cubic) })),
    );
  }, [fillH, index, reduceMotion, h]);
  const fillStyle = useAnimatedStyle(() => ({ height: h.get() }));

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        gap: 4,
        paddingTop: 5,
        paddingBottom: 4,
        borderRadius: Radius.sm,
        backgroundColor: viewed ? c.raised : 'transparent',
      }}>
      <View
        style={{
          width: 10,
          height: BAR_H,
          borderRadius: 5,
          overflow: 'hidden',
          backgroundColor: future ? 'transparent' : c.track,
          borderWidth: future ? 1.5 : 0,
          borderStyle: 'dashed',
          borderColor: c.text3,
        }}>
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: over ? c.alert : isToday ? c.accentLine : c.pastFill,
            },
            fillStyle,
          ]}
        />
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: tickB,
            height: 2,
            backgroundColor: future ? c.text3 : c.text,
          }}
        />
      </View>
      <Text
        maxFontSizeMultiplier={1.3}
        style={{ fontSize: 11, lineHeight: 13, fontWeight: '700', color: isToday ? c.accentText : viewed ? c.text : c.text2 }}>
        {DAY_LETTERS[index]}
      </Text>
    </View>
  );
}

/** Seven small bars for the week (eaten vs target tick) and a one-line summary. Opens Week. */
export function WeekStrip({
  days,
  viewedDate,
  summary,
  onPress = () => router.navigate('/week'),
  interactive = true,
}: {
  days: WeekDay[];
  viewedDate: string;
  /** Omit to show the bars only. */
  summary?: WeekSummary;
  onPress?: () => void;
  /** False on Week itself, where the strip isn't a link. */
  interactive?: boolean;
}) {
  const c = useTheme();
  const scale = Math.max(1, ...days.map((d) => Math.max(d.eaten, d.adjusted))) * 1.15;
  const dot = summary ? { good: c.good, info: c.info, warn: c.warn }[summary.tone] : c.text2;
  return (
    <Pressable
      accessibilityRole={interactive ? 'link' : undefined}
      accessibilityLabel={summary ? `This week: ${summary.head} ${summary.tail}.${interactive ? ' Opens Week' : ''}` : undefined}
      disabled={!interactive}
      onPress={onPress}
      style={({ pressed }) => ({ alignSelf: 'stretch', gap: Spacing.sm, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {days.map((d, i) => (
          <WeekBar key={d.date} day={d} index={i} scale={scale} viewed={d.date === viewedDate} />
        ))}
      </View>
      {summary ? (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />
        <Text
          maxFontSizeMultiplier={1.3}
          style={{ flex: 1, fontSize: 13, lineHeight: 18, fontVariant: ['tabular-nums'] }}
          numberOfLines={2}>
          <Text style={{ fontWeight: '600', color: summary.tone === 'good' ? c.accentText : dot }}>{summary.head}</Text>
          <Text style={{ color: c.text2 }}> {summary.tail}</Text>
        </Text>
        {interactive ? <Icon name="chevron-right" size={16} color={c.text3} strokeWidth={2.2} /> : null}
      </View>
      ) : null}
    </Pressable>
  );
}
