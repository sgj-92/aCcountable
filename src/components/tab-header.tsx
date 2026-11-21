import { View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { IconButton, Row, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Large-title header for a tab: a small line above the 34 pt title, and optionally
 * ‹ › arrows with a "↩" chip to jump back (to today / this week).
 */
export function TabHeader({
  title,
  sub,
  onPrev,
  onNext,
  nextDim,
  back,
  unit = 'day',
}: {
  /** For the arrows' spoken labels: "Previous day", "Next week". */
  unit?: 'day' | 'week';
  title: string;
  sub?: string;
  onPrev?: () => void;
  onNext?: () => void;
  /** Draw › in text3 (e.g. on today, where the future is for planning). */
  nextDim?: boolean;
  back?: { label: string; onPress: () => void } | null;
}) {
  const c = useTheme();
  return (
    <Row style={{ alignItems: 'flex-end', justifyContent: 'space-between', paddingBottom: 2 }}>
      <View style={{ gap: 2, flexShrink: 1 }}>
        {sub ? (
          <T variant="footnote" style={{ fontWeight: '600' }} numberOfLines={1}>
            {sub}
          </T>
        ) : null}
        <T variant="largeTitle" numberOfLines={1}>
          {title}
        </T>
      </View>
      {onPrev && onNext ? (
        <Row gap={Spacing.sm}>
          {back ? (
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={back.label}
              onPress={back.onPress}
              hitSlop={6}
              style={{ height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: c.goodBg, justifyContent: 'center' }}>
              <T color={c.accentText} style={{ fontSize: 13, fontWeight: '700' }}>
                ↩ {back.label.replace(/^Back to /, '').replace(/^./, (s) => s.toUpperCase())}
              </T>
            </PressableScale>
          ) : null}
          <IconButton glyph="‹" label={`Previous ${unit}`} onPress={onPrev} />
          <IconButton glyph="›" label={`Next ${unit}`} onPress={onNext} color={nextDim ? c.text3 : c.text} />
        </Row>
      ) : null}
    </Row>
  );
}
