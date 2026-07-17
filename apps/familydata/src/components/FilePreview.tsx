import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { subscribePreviewWipe } from '@/security/previewSession';
import { useAppTheme } from '@/theme/useAppTheme';
import { guessFileKind, readFileBase64 } from '@/utils/files';
import { buildOfflinePdfPreviewHtml, loadLocalPdfJs } from '@/utils/pdfPreview';

type Props = {
  uri: string;
  /** Bumps on vault lock – clears in-memory preview content. */
  wipeToken?: number;
};

export function FilePreview({ uri, wipeToken = 0 }: Props) {
  const { colors, scheme } = useAppTheme();
  const kind = guessFileKind(uri);
  const [pdfHtml, setPdfHtml] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(kind === 'pdf');
  const [webKey, setWebKey] = useState(0);

  function clearPreviewMemory() {
    setPdfHtml('');
    setError('');
    setLoading(false);
    setWebKey((k) => k + 1);
    void Image.clearMemoryCache();
    void Image.clearDiskCache();
  }

  useEffect(() => subscribePreviewWipe(clearPreviewMemory), []);

  useEffect(() => {
    clearPreviewMemory();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional wipe on token/uri change
  }, [wipeToken]);

  useEffect(() => {
    if (kind !== 'pdf') return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError('');
        const [{ pdfJs, workerJs }, base64] = await Promise.all([loadLocalPdfJs(), readFileBase64(uri)]);
        if (!cancelled) {
          setPdfHtml(buildOfflinePdfPreviewHtml(base64, pdfJs, workerJs, { dark: scheme === 'dark' }));
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message || 'PDF konnte nicht geladen werden.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      setPdfHtml('');
    };
  }, [uri, kind, wipeToken, scheme]);

  if (kind === 'image') {
    return (
      <View style={[styles.fill, { backgroundColor: colors.canvas }]}>
        <Image source={{ uri }} style={styles.image} contentFit="contain" recyclingKey={`${uri}-${wipeToken}`} />
      </View>
    );
  }

  if (kind === 'pdf') {
    if (error) {
      return (
        <View style={[styles.centered, { backgroundColor: colors.canvas }]}>
          <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
        </View>
      );
    }
    if (loading || !pdfHtml) {
      return (
        <View style={[styles.centered, { backgroundColor: colors.canvas }]}>
          <ActivityIndicator color={colors.pine} />
          <Text style={[styles.hint, { color: colors.mute }]}>PDF wird geladen…</Text>
        </View>
      );
    }
    return (
      <WebView
        key={`pdf-${webKey}-${wipeToken}-${scheme}`}
        originWhitelist={['about:blank']}
        source={{ html: pdfHtml, baseUrl: 'about:blank' }}
        style={[styles.fill, { backgroundColor: colors.canvas }]}
        allowFileAccess={false}
        allowUniversalAccessFromFileURLs={false}
        mixedContentMode="never"
        javaScriptEnabled
        domStorageEnabled={false}
        setSupportMultipleWindows={false}
        thirdPartyCookiesEnabled={false}
        sharedCookiesEnabled={false}
      />
    );
  }

  return (
    <View style={[styles.centered, { backgroundColor: colors.canvas }]}>
      <Text style={[styles.hint, { color: colors.mute }]}>Dieser Dateityp kann hier nicht angezeigt werden.</Text>
      <Text style={[styles.sub, { color: colors.placeholder }]}>
        Du kannst die Datei trotzdem als PDF speichern.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  image: { flex: 1, width: '100%' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { textAlign: 'center', fontFamily: 'DMSans_400Regular' },
  hint: { marginTop: 10, textAlign: 'center', fontFamily: 'DMSans_400Regular' },
  sub: { marginTop: 6, textAlign: 'center', fontFamily: 'DMSans_400Regular', fontSize: 13 },
});
