import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { WebView } from 'react-native-webview';

import { guessFileKind, readFileBase64 } from '@/utils/files';

type Props = {
  uri: string;
};

function escapeForHtmlScript(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}

function buildPdfJsPreviewHtml(base64: string): string {
  const safeBase64 = escapeForHtmlScript(base64);
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=4.0, user-scalable=yes" />
    <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; height: 100%; background: #e8f0ec; }
      #status {
        background: #0c3b2e;
        color: #fff;
        font-size: 13px;
        font-weight: 600;
        padding: 10px 12px;
        text-align: center;
      }
      #pages { display: flex; flex-direction: column; gap: 12px; padding: 12px; }
      canvas { background: #fff; box-shadow: 0 2px 10px rgba(0,0,0,0.12); display: block; width: 100%; height: auto; }
      .error { color: #b42318; padding: 20px; text-align: center; line-height: 1.5; }
    </style>
  </head>
  <body>
    <div id="status">PDF-Vorschau</div>
    <div id="pages"></div>
    <script>
      (async function () {
        const status = document.getElementById('status');
        const container = document.getElementById('pages');
        try {
          if (!window.pdfjsLib) throw new Error('PDF.js konnte nicht geladen werden.');
          const pdfjsLib = window.pdfjsLib;
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          const binary = atob('${safeBase64}');
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
          status.textContent = 'PDF-Vorschau · ' + pdf.numPages + ' Seite(n)';
          for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
            const page = await pdf.getPage(pageNumber);
            const viewport = page.getViewport({ scale: 1.35 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            container.appendChild(canvas);
            await page.render({ canvasContext: context, viewport: viewport }).promise;
          }
        } catch (error) {
          status.textContent = 'Vorschau fehlgeschlagen';
          container.innerHTML = '<div class="error">' + (error && error.message ? error.message : 'PDF konnte nicht angezeigt werden.') + '</div>';
        }
      })();
    </script>
  </body>
</html>`;
}

export function FilePreview({ uri }: Props) {
  const kind = guessFileKind(uri);
  const [pdfHtml, setPdfHtml] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(kind === 'pdf');

  useEffect(() => {
    if (kind !== 'pdf') return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError('');
        const base64 = await readFileBase64(uri);
        if (!cancelled) setPdfHtml(buildPdfJsPreviewHtml(base64));
      } catch (e) {
        if (!cancelled) setError((e as Error).message || 'PDF konnte nicht geladen werden.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uri, kind]);

  if (kind === 'image') {
    return (
      <View style={styles.fill}>
        <Image source={{ uri }} style={styles.image} contentFit="contain" />
      </View>
    );
  }

  if (kind === 'pdf') {
    if (error) {
      return (
        <View style={styles.centered}>
          <Text style={styles.error}>{error}</Text>
        </View>
      );
    }
    if (loading || !pdfHtml) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator color="#0c3b2e" />
          <Text style={styles.hint}>PDF wird geladen…</Text>
        </View>
      );
    }
    return (
      <WebView
        originWhitelist={['*']}
        source={{ html: pdfHtml }}
        style={styles.fill}
        allowFileAccess
        allowUniversalAccessFromFileURLs
        mixedContentMode="always"
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
      />
    );
  }

  return (
    <View style={styles.centered}>
      <Text style={styles.hint}>Dieser Dateityp kann hier nicht angezeigt werden.</Text>
      <Text style={styles.sub}>Du kannst die Datei trotzdem als PDF speichern.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#e8f0ec' },
  image: { flex: 1, width: '100%' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#e8f0ec' },
  error: { color: '#b42318', textAlign: 'center', fontFamily: 'DMSans_400Regular' },
  hint: { marginTop: 10, color: '#5a7368', textAlign: 'center', fontFamily: 'DMSans_400Regular' },
  sub: { marginTop: 6, color: '#7a9086', textAlign: 'center', fontFamily: 'DMSans_400Regular', fontSize: 13 },
});
