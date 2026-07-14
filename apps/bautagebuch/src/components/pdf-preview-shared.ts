import { StyleSheet } from 'react-native';

import { colors } from '@/theme/colors';
import { ui } from '@/theme/ui';

export function escapeForHtmlScript(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}

export function buildPdfJsPreviewHtml(base64: string): string {
  const safeBase64 = escapeForHtmlScript(base64);
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=4.0, user-scalable=yes" />
    <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; height: 100%; background: #e8edf2; }
      body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
      #status {
        background: #12534b;
        color: #fff;
        font-size: 13px;
        font-weight: 600;
        padding: 10px 12px;
        text-align: center;
      }
      #pages {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 12px;
      }
      canvas {
        background: #fff;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12);
        display: block;
        height: auto;
        width: 100%;
      }
      .error {
        color: #b42318;
        line-height: 1.5;
        padding: 20px;
        text-align: center;
      }
    </style>
  </head>
  <body>
    <div id="status">PDF-Vorschau · Pinch zum Zoomen</div>
    <div id="pages"></div>
    <script>
      (async function () {
        const status = document.getElementById('status');
        const container = document.getElementById('pages');
        try {
          if (!window.pdfjsLib) throw new Error('PDF.js konnte nicht geladen werden (Netzwerk/COEP).');
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

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export const pdfPreviewStyles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: ui.radius.md,
    borderWidth: 1,
    flex: 1,
    minHeight: 360,
    overflow: 'hidden',
    ...ui.shadow.card,
  },
  compact: {
    minHeight: 280,
  },
  header: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: ui.spacing.md,
    paddingVertical: ui.spacing.sm,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  headerHint: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  refreshChip: {
    backgroundColor: '#e8f4f2',
    borderRadius: ui.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  refreshChipText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  viewer: {
    flex: 1,
    minHeight: 280,
    position: 'relative',
  },
  webview: {
    backgroundColor: '#e8edf2',
    flex: 1,
  },
  webLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centered: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: ui.spacing.lg,
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: 14,
    marginTop: 12,
    textAlign: 'center',
  },
  errorTitle: {
    color: colors.danger,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  placeholderTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  placeholderText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  refreshButton: {
    backgroundColor: colors.primary,
    borderRadius: ui.radius.sm,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  refreshButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
});
