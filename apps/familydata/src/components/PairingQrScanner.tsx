import { CameraView, useCameraPermissions } from 'expo-camera';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/ui';
import { beginAutoLockSuppress, endAutoLockSuppress } from '@/security/autoLockSuppress';
import { useAppTheme } from '@/theme/useAppTheme';

type Props = {
  onScan: (data: string) => void;
  disabled?: boolean;
  hint?: string;
};

/**
 * Live QR camera. Auto-lock is suppressed only while the preview is actively scanning
 * (permission granted, not disabled, not post-scan locked).
 */
export function PairingQrScanner({ onScan, disabled, hint }: Props) {
  const { colors } = useAppTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false);

  const cameraLive = Boolean(permission?.granted) && !disabled && !locked;

  useEffect(() => {
    if (!cameraLive) return;
    beginAutoLockSuppress();
    return () => {
      endAutoLockSuppress();
    };
  }, [cameraLive]);

  const handleBarcode = useCallback(
    ({ data }: { data: string }) => {
      if (disabled || locked || !data?.trim()) return;
      setLocked(true);
      onScan(data.trim());
    },
    [disabled, locked, onScan]
  );

  if (!permission) {
    return (
      <View className="items-center py-10">
        <Text className="font-sans text-mute dark:text-[#9bb0a6]">Kamerazugriff wird geprüft…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View className="gap-3 py-6">
        <Text className="text-center font-sans text-[15px] leading-5 text-mute dark:text-[#9bb0a6]">
          Zum Scannen des Verbindungscodes wird die Kamera benötigt. Es werden keine Fotos gespeichert.
        </Text>
        <PrimaryButton
          label="Kamera erlauben"
          icon="camera-outline"
          accessibilityLabel="Kamerazugriff erlauben zum Scannen"
          onPress={() => void requestPermission()}
        />
      </View>
    );
  }

  return (
    <View>
      {hint ? (
        <Text className="mb-3 text-center font-sans text-sm text-mute dark:text-[#9bb0a6]">{hint}</Text>
      ) : null}
      <View
        accessible
        accessibilityLabel={
          locked
            ? 'Code erkannt. Tippe auf Erneut scannen, um erneut zu scannen.'
            : 'Kamera bereit. Halte den QR-Code des anderen Geräts in den Rahmen.'
        }
        accessibilityRole="image"
        className="overflow-hidden rounded-3xl border border-line dark:border-[#2a3f35]"
        style={{ height: 280 }}
      >
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={disabled || locked ? undefined : handleBarcode}
        />
        <View
          pointerEvents="none"
          style={{
            ...StyleSheet.absoluteFillObject,
            borderWidth: 2,
            borderColor: colors.pine,
            margin: 36,
            borderRadius: 16,
            backgroundColor: 'transparent',
          }}
        />
      </View>
      {locked ? (
        <View className="mt-3">
          <PrimaryButton
            label="Erneut scannen"
            tone="soft"
            accessibilityLabel="Erneut scannen"
            onPress={() => setLocked(false)}
          />
        </View>
      ) : null}
    </View>
  );
}
