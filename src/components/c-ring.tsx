import * as Haptics from 'expo-haptics';
import { useEffect, useRef } from 'react';
import { Platform, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, G } from 'react-native-svg';

import { fmt } from '@/components/ui';
import { Type } from '@/constants/theme';
import { useCountUp } from '@/hooks/use-count-up';
import { useTheme } from '@/hooks/use-theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * The calorie ring: a 270° arc with the gap facing right, like the C in the logo.
 * Drawn as track → training share (at the arc's end) → eaten fill, which turns alert when over.
 */
export function CRing({
  eaten,
  target,
  training,
  closedUnder,
  size = 208,
  stroke = 16,
}: {
  eaten: number;
  target: number;
  /** kcal of the target that comes from training; drawn as a tinted segment. */
  training: number;
  /** A finished past day that came in under: the number reads "kcal under" in good. */
  closedUnder?: boolean;
  size?: number;
  stroke?: number;
}) {
  const c = useTheme();
  const reduceMotion = useReducedMotion();
  const r = (size - stroke) / 2;
  const arc = 2 * Math.PI * r * 0.75;
  const left = target - eaten;
  const over = left < 0;
  const ratio = target > 0 ? Math.min(1, Math.max(0, eaten / target)) : 0;
  const trainLen = target > 0 ? arc * Math.min(1, Math.max(0, training / target)) : 0;

  const fill = useSharedValue(reduceMotion ? ratio : 0);
  const overness = useSharedValue(over ? 1 : 0);
  const wasOver = useRef(over);

  useEffect(() => {
    fill.set(reduceMotion ? ratio : withTiming(ratio, { duration: 700, easing: Easing.out(Easing.cubic) }));
  }, [ratio, reduceMotion, fill]);

  useEffect(() => {
    overness.set(reduceMotion ? (over ? 1 : 0) : withTiming(over ? 1 : 0, { duration: 240 }));
    if (over && !wasOver.current && Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    }
    wasOver.current = over;
  }, [over, reduceMotion, overness]);

  const hasEaten = eaten > 0;
  const fillProps = useAnimatedProps(() => ({
    strokeDasharray: [Math.max(0.01, fill.get() * arc), 2000],
    strokeOpacity: hasEaten ? 1 : 0,
  }));
  // The alert arc sits on top of the fill and fades in (240 ms) when the day goes over.
  const overProps = useAnimatedProps(() => ({
    strokeDasharray: [Math.max(0.01, fill.get() * arc), 2000],
    strokeOpacity: hasEaten ? overness.get() : 0,
  }));

  const shown = useCountUp(Math.abs(left));
  const unit = over ? 'kcal over' : closedUnder ? 'kcal under' : 'kcal left';
  const numColor = over ? c.alert : closedUnder ? c.good : c.text;
  const unitColor = over ? c.alert : closedUnder ? c.good : c.text2;
  const sub = left === 0 && eaten > 0 ? 'On target' : `${fmt(eaten)} eaten of ${fmt(target)}`;
  const label = over
    ? `${fmt(-left)} kcal over a target of ${fmt(target)}`
    : `${fmt(left)} kcal ${closedUnder ? 'under' : 'left of'} ${fmt(target)}`;
  const mid = size / 2;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <G rotation={45} origin={`${mid}, ${mid}`}>
          <Circle
            cx={mid}
            cy={mid}
            r={r}
            fill="none"
            stroke={c.track}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={[arc, 2000]}
          />
          {trainLen > 0 ? (
            <Circle
              cx={mid}
              cy={mid}
              r={r}
              fill="none"
              stroke={c.trainingSeg}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={[trainLen, 2000]}
              strokeDashoffset={-(arc - trainLen)}
            />
          ) : null}
          <AnimatedCircle
            cx={mid}
            cy={mid}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            stroke={c.accentLine}
            animatedProps={fillProps}
          />
          <AnimatedCircle
            cx={mid}
            cy={mid}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            stroke={c.alert}
            animatedProps={overProps}
          />
        </G>
      </Svg>
      <Text
        maxFontSizeMultiplier={1.3}
        style={[Type.numHero, { color: numColor, fontVariant: ['tabular-nums'] }]}>
        {fmt(shown)}
      </Text>
      <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 15, lineHeight: 20, fontWeight: '600', color: unitColor }}>
        {unit}
      </Text>
      <Text
        maxFontSizeMultiplier={1.3}
        style={{ marginTop: 4, fontSize: 13, lineHeight: 18, color: c.text2, fontVariant: ['tabular-nums'] }}>
        {sub}
      </Text>
    </View>
  );
}
