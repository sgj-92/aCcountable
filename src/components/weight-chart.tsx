import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import { T } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { parseISODate } from '@/lib/dates';
import type { TrendPoint } from '@/lib/weight';

/** Weigh-ins as dots, the smoothed trend as a line. */
export function WeightChart({ points, height = 140 }: { points: TrendPoint[]; height?: number }) {
  const c = useTheme();
  const [width, setWidth] = useState(0);
  if (points.length === 0) return null;

  const t = (d: string) => parseISODate(d).getTime();
  const x0 = t(points[0].date);
  const x1 = Math.max(x0 + 86_400_000, t(points[points.length - 1].date));
  const values = points.flatMap((p) => [p.weight, p.trend]);
  const lo = Math.min(...values) - 0.3;
  const hi = Math.max(...values) + 0.3;
  const pad = 6;
  const px = (d: string) => pad + ((t(d) - x0) / (x1 - x0)) * (width - pad * 2);
  const py = (v: number) => pad + (1 - (v - lo) / (hi - lo)) * (height - pad * 2);

  return (
    <View style={{ gap: 4 }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          {[0.25, 0.5, 0.75].map((f) => (
            <Line key={f} x1={0} x2={width} y1={height * f} y2={height * f} stroke={c.border} strokeWidth={1} />
          ))}
          {points.map((p) => (
            <Circle key={p.date} cx={px(p.date)} cy={py(p.weight)} r={3} fill={c.textMuted} opacity={0.6} />
          ))}
          <Polyline
            points={points.map((p) => `${px(p.date)},${py(p.trend)}`).join(' ')}
            fill="none"
            stroke={c.primary}
            strokeWidth={3}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </Svg>
      ) : (
        <View style={{ height }} />
      )}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <T variant="small">{hi.toFixed(1)} kg top</T>
        <T variant="small">{lo.toFixed(1)} kg bottom</T>
      </View>
    </View>
  );
}
