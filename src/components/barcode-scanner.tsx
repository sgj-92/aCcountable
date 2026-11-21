import { CameraView, useCameraPermissions, type BarcodeType } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef } from 'react';
import { Linking, Platform, Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { Button, Card, Loading, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Retail product barcodes only (no QR codes etc.).
const PRODUCT_BARCODES: BarcodeType[] = ['ean13', 'ean8', 'upc_a', 'upc_e'];
const FRAME_W = 260;
const FRAME_H = 160;

export function BarcodeScanner({ onScanned, onClose }: { onScanned: (code: string) => void; onClose: () => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  // The camera fires repeatedly while a code is in view; only take the first.
  const handled = useRef(false);

  if (!permission) return <Loading />;

  if (!permission.granted) {
    return (
      <Card>
        <T variant="headline">Camera access needed</T>
        <T variant="footnote">Allow camera access to scan barcodes on packaged food.</T>
        {permission.canAskAgain ? (
          <Button title="Allow camera" onPress={requestPermission} />
        ) : (
          <Button title="Open Settings" onPress={() => Linking.openSettings()} />
        )}
        <Button title="Cancel" variant="ghost" onPress={onClose} />
      </Card>
    );
  }

  return (
    <View style={{ height: 300, borderRadius: 22, overflow: 'hidden', backgroundColor: '#000' }}>
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: PRODUCT_BARCODES }}
        onBarcodeScanned={({ data }) => {
          if (handled.current || !data) return;
          handled.current = true;
          if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          onScanned(data);
        }}
      />
      <AimingFrame />
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close scanner"
        style={{
          position: 'absolute',
          top: Spacing.sm,
          right: Spacing.sm,
          width: 44,
          height: 44,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="close" size={16} color="#fff" strokeWidth={2.4} />
        </View>
      </Pressable>
      <Text
        style={{
          position: 'absolute',
          bottom: Spacing.md,
          alignSelf: 'center',
          color: '#fff',
          fontSize: 13,
          fontWeight: '600',
          backgroundColor: 'rgba(0,0,0,0.45)',
          paddingHorizontal: Spacing.md,
          paddingVertical: 4,
          borderRadius: 12,
          overflow: 'hidden',
        }}>
        Point at the barcode
      </Text>
    </View>
  );
}

/** 260 × 160 frame with accent corner brackets and a sweeping scan line. */
function AimingFrame() {
  const c = useTheme();
  const reduceMotion = useReducedMotion();
  const y = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    y.set(withRepeat(withTiming(FRAME_H - 2, { duration: 1600, easing: Easing.inOut(Easing.quad) }), -1, true));
  }, [reduceMotion, y]);
  const line = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));
  const L = 26;
  const corner = (pos: object, edges: object) => (
    <View style={[{ position: 'absolute', width: L, height: L, borderColor: c.accent, borderRadius: 6 }, pos, edges]} />
  );
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', left: '50%', top: '50%', width: FRAME_W, height: FRAME_H, marginLeft: -FRAME_W / 2, marginTop: -FRAME_H / 2 }}>
      {corner({ left: 0, top: 0 }, { borderLeftWidth: 4, borderTopWidth: 4 })}
      {corner({ right: 0, top: 0 }, { borderRightWidth: 4, borderTopWidth: 4 })}
      {corner({ left: 0, bottom: 0 }, { borderLeftWidth: 4, borderBottomWidth: 4 })}
      {corner({ right: 0, bottom: 0 }, { borderRightWidth: 4, borderBottomWidth: 4 })}
      {!reduceMotion ? (
        <Animated.View style={[{ position: 'absolute', left: 8, right: 8, top: 0, height: 2, backgroundColor: c.accent, opacity: 0.85 }, line]} />
      ) : null}
    </View>
  );
}
