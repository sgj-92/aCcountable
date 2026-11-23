import { useEffect, useState } from 'react';
import { ActionSheetIOS, Modal, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface MenuOption {
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

type Request = { options: MenuOption[]; title?: string };
let present: ((r: Request) => void) | null = null;

/**
 * A native action sheet on iOS. Elsewhere a bottom sheet drawn by <MenuHost />
 * (Android's alert dialog only fits three buttons, which would drop options).
 */
export function showMenu(options: MenuOption[], title?: string) {
  if (Platform.OS === 'ios') {
    const labels = [...options.map((o) => o.label), 'Cancel'];
    const destructive = options.map((o, i) => (o.destructive ? i : -1)).filter((i) => i >= 0);
    ActionSheetIOS.showActionSheetWithOptions(
      { options: labels, cancelButtonIndex: labels.length - 1, destructiveButtonIndex: destructive, title },
      (i) => {
        if (i < options.length) options[i].onPress();
      },
    );
    return;
  }
  present?.({ options, title });
}

/** Mount once near the root: draws menus on Android and web. */
export function MenuHost() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const [req, setReq] = useState<Request | null>(null);

  useEffect(() => {
    present = setReq;
    return () => {
      present = null;
    };
  }, []);

  const close = () => setReq(null);
  const choose = (o: MenuOption) => {
    setReq(null);
    // Let the sheet close before opening anything else (another menu, a screen).
    setTimeout(o.onPress, 150);
  };

  return (
    <Modal visible={!!req} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <Pressable accessibilityLabel="Close menu" onPress={close} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: c.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingTop: Spacing.sm,
            paddingBottom: insets.bottom + Spacing.sm,
          }}>
          {req?.title ? (
            <Text
              numberOfLines={2}
              style={{ textAlign: 'center', color: c.text2, fontSize: 13, fontWeight: '600', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md }}>
              {req.title}
            </Text>
          ) : null}
          {req?.options.map((o) => (
            <Pressable
              key={o.label}
              accessibilityRole="button"
              onPress={() => choose(o)}
              style={({ pressed }) => ({
                minHeight: 52,
                justifyContent: 'center',
                paddingHorizontal: Spacing.xl,
                backgroundColor: pressed ? c.raised : 'transparent',
              })}>
              <Text style={{ fontSize: 17, color: o.destructive ? c.alert : c.text }}>{o.label}</Text>
            </Pressable>
          ))}
          <View style={{ height: 1, backgroundColor: c.line, marginVertical: Spacing.xs }} />
          <Pressable
            accessibilityRole="button"
            onPress={close}
            style={({ pressed }) => ({
              minHeight: 52,
              justifyContent: 'center',
              paddingHorizontal: Spacing.xl,
              backgroundColor: pressed ? c.raised : 'transparent',
            })}>
            <Text style={{ fontSize: 17, fontWeight: '600', color: c.accentText }}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
