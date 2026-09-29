/**
 * `npm run offline` — вся игра одним файлом: release/squishy-keys-vX.Y.Z-offline.html.
 * Его можно открыть двойным щелчком без сервера и без интернета. Для Яндекс Игр — `npm run zip`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inlineGame } from './lib/standalone.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  version: string;
};

if (!existsSync(join(dist, 'index.html'))) {
  console.error('В dist/ нет index.html. Сначала соберите игру: npm run build.');
  process.exit(1);
}

const page = inlineGame(readFileSync(join(dist, 'index.html'), 'utf8'), (path) =>
  readFileSync(join(dist, path)),
);
const releaseDir = join(root, 'release');
mkdirSync(releaseDir, { recursive: true });
const name = `squishy-keys-v${version}-offline.html`;
writeFileSync(join(releaseDir, name), page);
console.log(
  `Готово: release/${name} — ${(Buffer.byteLength(page) / 1024 / 1024).toFixed(2)} МБ. ` +
    'Открывается двойным щелчком, сервер не нужен.',
);
