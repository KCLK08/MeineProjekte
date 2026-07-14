import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { unstable_createElement as createElement } from 'react-native-web';

import { colors } from '@/theme/colors';
import * as AppFS from '@/lib/fs-storage';

type Props = {
  fileUri: string;
};

/**
 * Web PDF frame — never imports react-native-webview.
 * Uses a blob: URL so the browser's built-in PDF viewer works under COEP/COI.
 */
export function PdfHtmlFrame({ fileUri }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    (async () => {
      try {
        setError('');
        setSrc(null);
        const base64 = await AppFS.readAsStringAsync(fileUri, { encoding: AppFS.EncodingType.Base64 });
        const bytes = AppFS.base64ToBytes(base64);
        const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)], {
          type: 'application/pdf',
        });
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setSrc(objectUrl);
      } catch (e) {
        if (!cancelled) setError((e as Error).message || 'PDF konnte nicht geladen werden.');
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileUri]);

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (!src) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return createElement('iframe', {
    key: fileUri,
    title: 'PDF-Vorschau',
    src,
    style: {
      width: '100%',
      height: '100%',
      minHeight: 280,
      border: '0',
      background: '#e8edf2',
      display: 'block',
    },
  });
}

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minHeight: 280,
    padding: 16,
  },
  error: {
    color: colors.danger,
    textAlign: 'center',
  },
});
