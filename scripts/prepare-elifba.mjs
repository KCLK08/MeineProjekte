import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'apps/elifba');
const dist = join(src, 'dist');
const skip = new Set(['dist', 'node_modules', 'package.json', 'package-lock.json']);

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

for (const name of readdirSync(src)) {
  if (skip.has(name)) continue;
  const from = join(src, name);
  const to = join(dist, name);
  cpSync(from, to, { recursive: statSync(from).isDirectory() });
}

writeFileSync(join(dist, '.nojekyll'), '');
console.log('elifba dist bereit:', dist);
