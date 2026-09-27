/**
 * `npm run zip` — архив для Консоли Яндекс Игр: release/squishy-keys-vX.Y.Z.zip.
 * В корне архива лежит index.html (п. 1.22 требований), версия берётся из package.json.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listFiles } from './lib/files.ts';
import { createZip } from './lib/zip.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  version: string;
};

const files = listFiles(dist);
if (!files.some((file) => file.path === 'index.html')) {
  console.error('В dist/ нет index.html. Сначала соберите игру: npm run build.');
  process.exit(1);
}

const archive = createZip(
  files.map((file) => ({ path: file.path, data: readFileSync(join(dist, file.path)) })),
);
const releaseDir = join(root, 'release');
mkdirSync(releaseDir, { recursive: true });
const name = `squishy-keys-v${version}.zip`;
writeFileSync(join(releaseDir, name), archive);

const megabytes = (bytes: number) => (bytes / 1024 / 1024).toFixed(2);
const unpacked = files.reduce((sum, file) => sum + file.size, 0);
console.log(
  `Готово: release/${name} — ${files.length} файлов, архив ${megabytes(archive.length)} МБ, ` +
    `распакованная игра ${megabytes(unpacked)} МБ.`,
);
