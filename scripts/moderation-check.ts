/**
 * `npm run moderation` — самопроверка сборки перед отправкой на модерацию (CLAUDE.md).
 * Проверяет dist/ и исходники, падает с понятным сообщением, в конце печатает ручной чек-лист.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IAP_PRODUCTS } from '../src/config/iap.ts';
import { listFiles } from './lib/files.ts';
import {
  EXTRA_MANUAL_CHECKS,
  checkFileNames,
  checkForbiddenCode,
  checkI18nKeys,
  checkIndexAtRoot,
  checkPurchases,
  checkSdkCalls,
  checkSdkTag,
  checkSize,
  checkStorageOutsidePlatform,
  designChecklist,
  type CheckResult,
  type TextFile,
} from './lib/moderation.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const dist = join(root, 'dist');

if (!existsSync(join(dist, 'index.html'))) {
  console.error(
    'В dist/ нет сборки. Сначала выполните npm run build (или npm run moderation целиком).',
  );
  process.exit(1);
}

const distFiles = listFiles(dist);
const distText: TextFile[] = distFiles
  .filter((file) => /\.(js|mjs|css|html)$/.test(file.path))
  .map((file) => ({
    path: `dist/${file.path}`,
    text: readFileSync(join(dist, file.path), 'utf8'),
  }));
const bundle = distText
  .filter((file) => file.path.endsWith('.js'))
  .map((file) => file.text)
  .join('\n');
const sources: TextFile[] = listFiles(join(root, 'src'))
  .filter((file) => file.path.endsWith('.ts'))
  .map((file) => ({ path: `src/${file.path}`, text: read(`src/${file.path}`) }));

const results: CheckResult[] = [
  checkIndexAtRoot(distFiles),
  checkFileNames(distFiles),
  checkSize(distFiles),
  checkSdkTag(read('dist/index.html')),
  checkSdkCalls(bundle, read('src/platform/YandexPlatform.ts')),
  checkForbiddenCode(distText),
  checkStorageOutsidePlatform(sources),
  checkI18nKeys(JSON.parse(read('src/i18n/ru.json')), JSON.parse(read('src/i18n/en.json'))),
  checkPurchases(
    JSON.parse(read('purchases-catalog.json')),
    IAP_PRODUCTS.map((product) => product.id),
  ),
];

console.log('\nАвтоматическая проверка сборки:\n');
for (const check of results) {
  console.log(`${check.problems.length === 0 ? '✅' : '❌'} ${check.title}`);
  for (const problem of check.problems) console.log(`     — ${problem}`);
}

console.log('\nПроверьте вручную на реальном телефоне и десктопе (диздок, раздел 18):\n');
for (const item of designChecklist(read('docs/GAME_DESIGN.md'))) console.log(`[ ] ${item}`);
console.log('\nИ ещё по документации Яндекса (docs/yandex):\n');
for (const item of EXTRA_MANUAL_CHECKS) console.log(`[ ] ${item}`);

const failed = results.filter((check) => check.problems.length > 0);
if (failed.length > 0) {
  console.error(
    `\n❌ Проверка не пройдена: ${failed.length} из ${results.length}. Исправьте и запустите снова.`,
  );
  process.exit(1);
}
console.log(`\n✅ Все ${results.length} автоматических проверок пройдены.`);
