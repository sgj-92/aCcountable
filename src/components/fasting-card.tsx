import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Card, ProgressBar } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fastingStatus, formatClock, formatDuration } from '@/lib/fasting';

/** One-line intermittent-fasting status with a bar; ticks every minute. */
export function FastingBar({ startMin, endMin }: { startMin: number; endMin: number }) {
  const c = useTheme();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const s = fastingStatus(now, startMin, endMin);
  const eating = s.state === 'eating';
  const text = eating ? c.accentText : c.info;
  const bar = eating ? c.accentLine : c.info;
  const time = eating ? `${formatDuration(s.minutesLeft)} left` : `${formatDuration(s.elapsed)} fasted`;
  const right = eating ? `until ${formatClock(s.changesAt)}` : `opens ${formatClock(s.changesAt)}`;

  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: 12 }}>
      <Icon name="clock" size={20} color={text} strokeWidth={2.1} />
      <View
        style={{ flex: 1, gap: 6 }}
        accessible
        accessibilityLabel={`${eating ? 'Eating window' : 'Fasting'}, ${time}, ${right}`}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm }}>
          <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 13, lineHeight: 18, fontWeight: '600', color: c.text, fontVariant: ['tabular-nums'] }}>
            {eating ? 'Eating window' : 'Fasting'} · <Text style={{ color: text }}>{time}</Text>
          </Text>
          <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 13, lineHeight: 18, color: c.text2, fontVariant: ['tabular-nums'] }}>
            {right}
          </Text>
        </View>
        <ProgressBar value={s.elapsed} max={s.total} color={bar} />
      </View>
    </Card>
  );
}
