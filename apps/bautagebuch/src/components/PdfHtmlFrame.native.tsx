import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { colors } from '@/theme/colors';
import * as AppFS from '@/lib/fs-storage';
import { buildPdfJsPreviewHtml, pdfPreviewStyles } from './pdf-preview-shared';

type Props = {
  fileUri: string;
};

/** Native PDF frame via WebView + PDF.js HTML. */
export function PdfHtmlFrame({ fileUri }: Props) {
  const [html, setHtml] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setError('');
        setHtml('');
        const base64 = await AppFS.readAsStringAsync(fileUri, { encoding: AppFS.EncodingType.Base64 });
        const next = buildPdfJsPreviewHtml(base64);
        if (!cancelled) setHtml(next);
      } catch (e) {
        if (!cancelled) setError((e as Error).message || 'PDF konnte nicht geladen werden.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fileUri]);

  if (error) {
    return (
      <View style={pdfPreviewStyles.centered}>
        <Text style={pdfPreviewStyles.errorText}>{error}</Text>
      </View>
    );
  }

  if (!html) {
    return (
      <View style={pdfPreviewStyles.webLoading}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <WebView
      key={fileUri}
      originWhitelist={['*']}
      source={{ html }}
      style={pdfPreviewStyles.webview}
      startInLoadingState
      renderLoading={() => (
        <View style={pdfPreviewStyles.webLoading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}
      allowFileAccess
      allowUniversalAccessFromFileURLs
      mixedContentMode="always"
      javaScriptEnabled
      domStorageEnabled
      setSupportMultipleWindows={false}
    />
  );
}
