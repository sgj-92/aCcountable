import { CameraView, useCameraPermissions, type BarcodeType } from 'expo-camera';
import { useRef } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { Button, Card, Loading, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';

// Retail product barcodes only (no QR codes etc.).
const PRODUCT_BARCODES: BarcodeType[] = ['ean13', 'ean8', 'upc_a', 'upc_e'];

export function BarcodeScanner({ onScanned, onClose }: { onScanned: (code: string) => void; onClose: () => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  // The camera fires repeatedly while a code is in view; only take the first.
  const handled = useRef(false);

  if (!permission) return <Loading />;

  if (!permission.granted) {
    return (
      <Card>
        <T variant="heading">Camera access needed</T>
        <T variant="muted">Allow camera access to scan barcodes on packaged food.</T>
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
    <View style={{ height: 280, borderRadius: Radius.lg, overflow: 'hidden', backgroundColor: '#000' }}>
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: PRODUCT_BARCODES }}
        onBarcodeScanned={({ data }) => {
          if (handled.current || !data) return;
          handled.current = true;
          onScanned(data);
        }}
      />
      {/* Aiming guide */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: '12%',
          right: '12%',
          top: '35%',
          height: '30%',
          borderWidth: 2,
          borderColor: 'rgba(255,255,255,0.85)',
          borderRadius: Radius.md,
        }}
      />
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close scanner"
        style={{
          position: 'absolute',
          top: Spacing.sm,
          right: Spacing.sm,
          backgroundColor: 'rgba(0,0,0,0.55)',
          borderRadius: Radius.pill,
          paddingHorizontal: Spacing.md,
          paddingVertical: 6,
        }}>
        <Text style={{ color: '#fff', fontWeight: '600' }}>Close</Text>
      </Pressable>
      <Text
        style={{
          position: 'absolute',
          bottom: Spacing.md,
          alignSelf: 'center',
          color: '#fff',
          fontSize: 13,
          backgroundColor: 'rgba(0,0,0,0.45)',
          paddingHorizontal: Spacing.sm,
          paddingVertical: 2,
          borderRadius: Radius.sm,
        }}>
        Point at the barcode
      </Text>
    </View>
  );
}
