import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';

/**
 * Circular progress. Fills clockwise from the top; past 100% the ring turns
 * the danger colour so overshooting is obvious.
 */
export function Ring({
  value,
  max,
  size,
  stroke,
  color,
  children,
}: {
  value: number;
  max: number;
  size: number;
  stroke: number;
  color?: string;
  children?: ReactNode;
}) {
  const c = useTheme();
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const ratio = max > 0 ? value / max : 0;
  const over = ratio > 1.005;
  const shown = Math.max(0, Math.min(1, ratio));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={c.track} strokeWidth={stroke} fill="none" />
        {shown > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={over ? c.danger : (color ?? c.primary)}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * (1 - shown)}
          />
        ) : null}
      </Svg>
      {children}
    </View>
  );
}
