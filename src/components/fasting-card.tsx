import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Card, ProgressBar, Row, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fastingStatus, formatClock, formatDuration } from '@/lib/fasting';

/** Live intermittent-fasting status: time fasted / time left in the eating window. */
export function FastingCard({ startMin, endMin }: { startMin: number; endMin: number }) {
  const c = useTheme();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const s = fastingStatus(now, startMin, endMin);
  const eating = s.state === 'eating';
  const color = eating ? c.primary : c.training;

  return (
    <Card style={{ gap: Spacing.sm }}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="small" color={color}>
            {eating ? 'EATING WINDOW OPEN' : 'FASTING'}
          </T>
          <T variant="heading">
            {eating ? `${formatDuration(s.minutesLeft)} left to eat` : `${formatDuration(s.elapsed)} fasted`}
          </T>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <T variant="small">{eating ? 'Closes' : 'Opens'}</T>
          <T variant="heading">{formatClock(s.changesAt)}</T>
        </View>
      </Row>
      <ProgressBar value={s.elapsed} max={s.total} color={color} height={6} />
      <T variant="small">
        {eating
          ? `Window ${formatClock(startMin)}–${formatClock(endMin)}`
          : `${formatDuration(s.minutesLeft)} until your window opens · ${formatDuration(s.total)} fast`}
      </T>
    </Card>
  );
}
