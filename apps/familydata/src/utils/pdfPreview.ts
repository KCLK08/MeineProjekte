import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';

let cachedPdfJs: string | null = null;
let cachedWorker: string | null = null;

async function readAssetText(moduleId: number): Promise<string> {
  const asset = Asset.fromModule(moduleId);
  await asset.downloadAsync();
  if (!asset.localUri) throw new Error('PDF-Engine konnte nicht geladen werden.');
  return FileSystem.readAsStringAsync(asset.localUri);
}

/** Loads vendored pdf.js sources from the app bundle (offline). */
export async function loadLocalPdfJs(): Promise<{ pdfJs: string; workerJs: string }> {
  if (cachedPdfJs && cachedWorker) {
    return { pdfJs: cachedPdfJs, workerJs: cachedWorker };
  }
  const [pdfJs, workerJs] = await Promise.all([
    readAssetText(require('../../assets/pdfjs/pdf.min.txt')),
    readAssetText(require('../../assets/pdfjs/pdf.worker.min.txt')),
  ]);
  cachedPdfJs = pdfJs;
  cachedWorker = workerJs;
  return { pdfJs, workerJs };
}

function escapeForHtmlScript(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}

function escapeClosingScript(value: string): string {
  return value.replace(/<\/script/gi, '<\\/script');
}

export function buildOfflinePdfPreviewHtml(
  base64: string,
  pdfJs: string,
  workerJs: string,
  options?: { dark?: boolean }
): string {
  const safeBase64 = escapeForHtmlScript(base64);
  const safePdfJs = escapeClosingScript(pdfJs);
  const safeWorker = escapeClosingScript(workerJs);
  const dark = Boolean(options?.dark);
  const pageBg = dark ? '#0d1612' : '#e8f0ec';
  const statusBg = dark ? '#1a3028' : '#0c3b2e';
  const statusFg = dark ? '#e7f2ec' : '#fff';
  const errorFg = dark ? '#f97066' : '#b42318';

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=4.0, user-scalable=yes" />
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; height: 100%; background: ${pageBg}; }
      #status {
        background: ${statusBg};
        color: ${statusFg};
        font-size: 13px;
        font-weight: 600;
        padding: 10px 12px;
        text-align: center;
      }
      #pages { display: flex; flex-direction: column; gap: 12px; padding: 12px; }
      canvas { background: #fff; box-shadow: 0 2px 10px rgba(0,0,0,0.12); display: block; width: 100%; height: auto; }
      .error { color: ${errorFg}; padding: 20px; text-align: center; line-height: 1.5; }
    </style>
  </head>
  <body>
    <div id="status">PDF-Vorschau</div>
    <div id="pages"></div>
    <script type="text/plain" id="pdf-worker-source">${safeWorker}</script>
    <script>${safePdfJs}</script>
    <script>
      (async function () {
        const status = document.getElementById('status');
        const container = document.getElementById('pages');
        try {
          const workerSource = document.getElementById('pdf-worker-source').textContent || '';
          const workerBlob = new Blob([workerSource], { type: 'application/javascript' });
          const workerUrl = URL.createObjectURL(workerBlob);
          if (!window.pdfjsLib) throw new Error('Lokale PDF-Engine nicht verfügbar.');
          const pdfjsLib = window.pdfjsLib;
          pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
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
