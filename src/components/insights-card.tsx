import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { Button, Card, Row, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Insight, InsightLevel } from '@/lib/insights';

const MAX = 5;

/** A tinted 32 pt circle with the level's own shape, so colour is never the only signal. */
export function LevelIcon({ level, size = 32 }: { level: InsightLevel; size?: number }) {
  const c = useTheme();
  const fg = { alert: c.alert, warn: c.warn, info: c.info, good: c.good }[level];
  const bg = { alert: c.alertBg, warn: c.warnBg, info: c.infoBg, good: c.goodBg }[level];
  return (
    <View
      accessibilityLabel={{ alert: 'Alert', warn: 'Warning', info: 'Info', good: 'Good' }[level]}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={level} size={Math.round(size * 0.56)} color={fg} />
    </View>
  );
}

/** "On track?": the day's warnings, nudges and good news, most important first. */
export function InsightsCard({ insights }: { insights: Insight[] }) {
  const c = useTheme();
  const [expanded, setExpanded] = useState(false);
  if (insights.length === 0) return null;
  const shown = expanded ? insights : insights.slice(0, MAX);

  return (
    <Card hero style={{ gap: 0, paddingTop: 14, paddingBottom: 4 }}>
      <Row style={{ justifyContent: 'space-between', paddingBottom: 4 }}>
        <T variant="headline">On track?</T>
        <T variant="footnote">
          {insights.length} {insights.length === 1 ? 'check' : 'checks'}
        </T>
      </Row>
      {shown.map((i, idx) => (
        <Animated.View
          key={i.id}
          entering={FadeInDown.duration(220).delay(idx * 40)}
          style={{
            flexDirection: 'row',
            gap: Spacing.md,
            paddingVertical: 10,
            borderTopWidth: 1,
            borderTopColor: c.line,
          }}>
          <LevelIcon level={i.level} />
          <View style={{ flex: 1, gap: 2 }}>
            <T style={{ fontWeight: '600' }}>{i.title}</T>
            {i.detail ? <T variant="footnote">{i.detail}</T> : null}
            {i.action ? (
              <Pressable
                accessibilityRole="button"
                hitSlop={8}
                style={{ alignSelf: 'flex-start', paddingVertical: 4, marginTop: 2 }}
                onPress={() => router.push({ pathname: i.action!.pathname as never, params: i.action!.params })}>
                <T color={c.accentText} style={{ fontSize: 14, lineHeight: 18, fontWeight: '600' }}>
                  {i.action.label} ›
                </T>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      ))}
      {insights.length > shown.length ? (
        <Button
          title={`${insights.length - shown.length} more`}
          variant="ghost"
          size="S"
          onPress={() => setExpanded(true)}
          style={{ alignSelf: 'flex-start', marginBottom: Spacing.sm }}
        />
      ) : null}
    </Card>
  );
}
