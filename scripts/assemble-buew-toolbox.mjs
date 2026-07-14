import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = join(root, 'apps/buew-toolbox');
const dist = join(app, 'dist');

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'sitereport'), { recursive: true });
mkdirSync(join(dist, 'bautagebuch'), { recursive: true });

const rewrite = (text) =>
  text
    .replaceAll('/baustellen-tools/', '/buew-toolbox/')
    .replaceAll('"/baustellen-tools"', '"/buew-toolbox"');

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

console.log('buew-toolbox dist bereit:', dist);
