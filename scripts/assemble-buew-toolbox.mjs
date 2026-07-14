import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = join(root, 'apps/buew-toolbox/web');
const dist = join(root, 'apps/buew-toolbox/web/dist');
/** GitHub Pages base – repo name is case-sensitive on Pages */
const BASE = '/MeineProjekte/apps/buew-toolbox';

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'sitereport'), { recursive: true });
mkdirSync(join(dist, 'bautagebuch'), { recursive: true });

const rewrite = (text) =>
  text
    // Collapse accidental double rewrites first
    .replaceAll('/meineprojekte/apps/meineprojekte/apps/buew-toolbox/', `${BASE}/`)
    .replaceAll('/MeineProjekte/apps/MeineProjekte/apps/buew-toolbox/', `${BASE}/`)
    .replaceAll('/meineprojekte/apps/buew-toolbox/', `${BASE}/`)
    .replaceAll('/MeineProjekte/apps/buew-toolbox/', `${BASE}/`)
    .replaceAll('/baustellen-tools/', `${BASE}/`)
    // Only rewrite bare /buew-toolbox/ paths that are not already under MeineProjekte
    .replace(/(^|["'(=\s])\/buew-toolbox\//g, `$1${BASE}/`);

const copyText = (from, to) => {
  writeFileSync(to, rewrite(readFileSync(from, 'utf8')));
};

copyText(join(app, 'index.html'), join(dist, 'index.html'));
copyText(join(app, 'manifest.webmanifest'), join(dist, 'manifest.webmanifest'));

for (const file of ['apple-touch-icon.png', 'icon-192.png', 'icon-512.png']) {
  cpSync(join(app, file), join(dist, file));
}

for (const folder of ['tool-platzhalter-2', 'tool-platzhalter-3']) {
  mkdirSync(join(dist, folder), { recursive: true });
  copyText(join(app, folder, 'index.html'), join(dist, folder, 'index.html'));
}

cpSync(join(app, 'sitereport/build'), join(dist, 'sitereport'), { recursive: true });
cpSync(join(app, 'bautagebuch-v2/build'), join(dist, 'bautagebuch'), { recursive: true });
writeFileSync(join(dist, '.nojekyll'), '');

console.log('buew-toolbox web dist bereit:', dist, 'base:', BASE);
