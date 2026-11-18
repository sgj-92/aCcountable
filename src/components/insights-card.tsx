import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button, Card, Divider, Row, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Insight, InsightLevel } from '@/lib/insights';

/** "On track?": the day's warnings, nudges and good news, most important first. */
export function InsightsCard({ insights }: { insights: Insight[] }) {
  const c = useTheme();
  const [expanded, setExpanded] = useState(false);
  if (insights.length === 0) return null;

  const colour: Record<InsightLevel, string> = {
    alert: c.danger,
    warn: c.fat,
    info: c.carbs,
    good: c.success,
  };
  const shown = expanded ? insights : insights.slice(0, 3);

  return (
    <Card style={{ gap: 0 }}>
      <T variant="heading" style={{ marginBottom: Spacing.xs }}>
        On track?
      </T>
      {shown.map((i, idx) => (
        <View key={i.id}>
          {idx > 0 ? <Divider /> : null}
          <Row gap={Spacing.md} style={{ alignItems: 'flex-start', paddingVertical: Spacing.sm }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 7, backgroundColor: colour[i.level] }} />
            <View style={{ flex: 1, gap: 2 }}>
              <T>{i.title}</T>
              {i.detail ? <T variant="small">{i.detail}</T> : null}
              {i.action ? (
                <Pressable
                  accessibilityRole="button"
                  hitSlop={6}
                  onPress={() => router.push({ pathname: i.action!.pathname as never, params: i.action!.params })}>
                  <T variant="small" color={c.primary} style={{ fontWeight: '600', marginTop: 2 }}>
                    {i.action.label} ›
                  </T>
                </Pressable>
              ) : null}
            </View>
          </Row>
        </View>
      ))}
      {insights.length > shown.length ? (
        <Button title={`${insights.length - shown.length} more`} variant="ghost" onPress={() => setExpanded(true)} />
      ) : null}
    </Card>
  );
}
