import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';
import { formatDay, parseISODate } from '@/lib/dates';
import type { TrendPoint } from '@/lib/weight';

const DAY = 86_400_000;

/**
 * Weigh-ins as dots (latest highlighted), the smoothed trend as a line and,
 * optionally, the goal pace as a dashed line from the first trend point.
 */
export function WeightChart({
  points,
  height = 150,
  goalRatePerWeek,
}: {
  points: TrendPoint[];
  height?: number;
  /** kg per week, negative to lose. */
  goalRatePerWeek?: number;
}) {
  const c = useTheme();
  const [width, setWidth] = useState(0);
  if (points.length === 0) return null;

  const t = (d: string) => parseISODate(d).getTime();
  const x0 = t(points[0].date);
  const x1 = Math.max(x0 + DAY, t(points[points.length - 1].date));
  const goalEnd = goalRatePerWeek != null ? points[0].trend + (goalRatePerWeek * (x1 - x0)) / (7 * DAY) : null;
  const values = points.flatMap((p) => [p.weight, p.trend]).concat(goalEnd != null ? [goalEnd] : []);
  const lo = Math.min(...values) - 0.3;
  const hi = Math.max(...values) + 0.3;
  const padX = 6;
  const top = 6;
  const bottom = 18;
  const px = (ms: number) => padX + ((ms - x0) / (x1 - x0)) * (width - padX * 2);
  const py = (v: number) => top + (1 - (v - lo) / (hi - lo)) * (height - top - bottom);
  const trendPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(t(p.date)).toFixed(1)} ${py(p.trend).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  const first = points[0];
  const rate = goalRatePerWeek;

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityLabel={`Weight chart from ${formatDay(first.date)} to ${formatDay(last.date)}: trend ${first.trend.toFixed(1)} to ${last.trend.toFixed(1)} kg.`}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          {[0.25, 0.5, 0.75].map((f) => {
            const y = top + (height - top - bottom) * f;
            return <Line key={f} x1={0} x2={width} y1={y} y2={y} stroke={c.line} strokeWidth={1} />;
          })}
          {goalEnd != null && rate != null ? (
            <Line
              x1={px(x0)}
              y1={py(first.trend)}
              x2={px(x1)}
              y2={py(goalEnd)}
              stroke={c.text3}
              strokeWidth={1.6}
              strokeDasharray={[5, 5]}
            />
          ) : null}
          {points.slice(0, -1).map((p) => (
            <Circle key={p.date} cx={px(t(p.date))} cy={py(p.weight)} r={3.5} fill={c.text3} opacity={0.7} />
          ))}
          <Path d={trendPath} fill="none" stroke={c.accentLine} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
          <Circle cx={px(t(last.date))} cy={py(last.weight)} r={5} fill={c.accentLine} />
          <SvgText x={padX} y={height - 4} fill={c.text3} fontSize={11}>
            {formatDay(first.date)}
          </SvgText>
          <SvgText x={width - padX} y={height - 4} fill={c.text3} fontSize={11} textAnchor="end">
            {formatDay(last.date)}
          </SvgText>
        </Svg>
      ) : (
        <View style={{ height }} />
      )}
    </View>
  );
}
