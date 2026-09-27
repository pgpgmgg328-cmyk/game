import type { FileInfo } from './files.ts';

/** Результат одной проверки: ok и список найденных нарушений. */
export interface CheckResult {
  title: string;
  problems: string[];
}

export interface TextFile {
  path: string;
  text: string;
}

const MB = 1024 * 1024;
/** Жёсткий лимит Яндекса: содержимое архива до сжатия (п. 1.21). */
export const HARD_SIZE_LIMIT = 100 * MB;
/** Наша цель по размеру сборки (диздок, раздел 15). */
export const TARGET_SIZE = 5 * MB;

/** Тег SDK из документации для игр, загруженных архивом (docs/yandex/sdk/sdk-about.md). */
export const SDK_TAG = '<script src="/sdk.js"></script>';

/**
 * Разрешённые адреса в коде сборки. Это не сетевые запросы:
 * - пространства имён XML, через которые Phaser создаёт элементы;
 * - адрес сайта Phaser в тексте его баннера в консоли (баннер выключен настройкой banner: false).
 */
export const URL_WHITELIST: readonly string[] = [
  'http://www.w3.org/2000/svg',
  'http://www.w3.org/1999/xhtml',
  'https://phaser.io',
];

const result = (title: string, problems: string[]): CheckResult => ({ title, problems });

export function checkIndexAtRoot(files: readonly FileInfo[]): CheckResult {
  const ok = files.some((file) => file.path === 'index.html');
  return result(
    'index.html лежит в корне сборки (п. 1.22)',
    ok ? [] : ['В корне dist/ нет index.html'],
  );
}

export function checkFileNames(files: readonly FileInfo[]): CheckResult {
  const bad = files
    .filter((file) => !/^[A-Za-z0-9._\-/]+$/.test(file.path))
    .map((file) => `Имя с пробелом, кириллицей или спецсимволом: ${file.path}`);
  return result('Имена файлов и папок латиницей, без пробелов (п. 1.22)', bad);
}

export function checkSize(
  files: readonly FileInfo[],
  limits = { hard: HARD_SIZE_LIMIT, target: TARGET_SIZE },
): CheckResult {
  const total = files.reduce((sum, file) => sum + file.size, 0);
  const mb = (bytes: number) => `${(bytes / MB).toFixed(2)} МБ`;
  const problems: string[] = [];
  if (total > limits.hard) {
    problems.push(
      `Игра весит ${mb(total)}, Яндекс принимает не больше ${mb(limits.hard)} (п. 1.21)`,
    );
  } else if (total > limits.target) {
    problems.push(
      `Игра весит ${mb(total)}, наша цель — меньше ${mb(limits.target)} (диздок, раздел 15)`,
    );
  }
  return result(`Размер игры: ${mb(total)} (цель — меньше ${mb(limits.target)})`, problems);
}

export function checkSdkTag(indexHtml: string): CheckResult {
  const problems: string[] = [];
  const head = /<head[^>]*>([\s\S]*?)<\/head>/i.exec(indexHtml)?.[1] ?? '';
  const occurrences = indexHtml.split(SDK_TAG).length - 1;
  if (occurrences !== 1) {
    problems.push(`Тег ${SDK_TAG} должен встречаться ровно один раз, найдено: ${occurrences}`);
  }
  if (!head.includes(SDK_TAG)) problems.push(`Тег ${SDK_TAG} должен стоять в <head>`);
  const sdkIndex = indexHtml.indexOf(SDK_TAG);
  const firstOtherScript = indexHtml.search(/<script(?![^>]*src="\/sdk\.js")[^>]*>/i);
  if (sdkIndex >= 0 && firstOtherScript >= 0 && firstOtherScript < sdkIndex) {
    problems.push('Скрипт игры подключён раньше /sdk.js');
  }
  if (/src=["'](\.\/|https?:)[^"']*sdk\.js/i.test(indexHtml)) {
    problems.push('Путь к SDK изменён: должен быть ровно "/sdk.js"');
  }
  return result('Тег /sdk.js на месте и не изменён (п. 1.19.1)', problems);
}

export function checkSdkCalls(bundle: string, platformSource: string): CheckResult {
  const problems: string[] = [];
  for (const api of ['LoadingAPI', 'GameplayAPI']) {
    if (!bundle.includes(api)) problems.push(`В сборке нет обращений к ${api}`);
  }
  const calls: [RegExp, string][] = [
    [/LoadingAPI\??\.ready\(\)/, 'LoadingAPI.ready()'],
    [/GameplayAPI\??\.start\(\)/, 'GameplayAPI.start()'],
    [/GameplayAPI\??\.stop\(\)/, 'GameplayAPI.stop()'],
  ];
  for (const [pattern, name] of calls) {
    if (!pattern.test(platformSource)) problems.push(`В YandexPlatform нет вызова ${name}`);
  }
  return result('Вызываются LoadingAPI.ready и GameplayAPI (п. 1.19.2, 1.19.3)', problems);
}

const URL_PATTERN = /https?:\/\/[^\s"'`<>()\\]+/g;

export function checkForbiddenCode(
  files: readonly TextFile[],
  whitelist: readonly string[] = URL_WHITELIST,
): CheckResult {
  const problems: string[] = [];
  for (const file of files) {
    for (const match of file.text.match(URL_PATTERN) ?? []) {
      const url = match.replace(/\/+$/, '');
      if (!whitelist.includes(url)) problems.push(`${file.path}: внешний адрес ${match}`);
    }
    if (/\bwindow\.open\b/.test(file.text)) problems.push(`${file.path}: window.open`);
    if (/<a\s[^>]*href/i.test(file.text)) problems.push(`${file.path}: ссылка <a href>`);
    if (/s3\.yandex\.net|storage\.yandexcloud\.net/.test(file.text)) {
      problems.push(`${file.path}: абсолютный адрес на S3 Яндекса (п. 1.7)`);
    }
  }
  return result(
    'Нет внешних ссылок, window.open, <a href> и адресов S3 (п. 1.7, 8.4)',
    Array.from(new Set(problems)),
  );
}

/** Убирает комментарии, чтобы упоминания в пояснениях не считались обращениями. */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
}

export function checkStorageOutsidePlatform(sources: readonly TextFile[]): CheckResult {
  const problems = sources
    .filter((file) => !file.path.startsWith('src/platform/'))
    .filter((file) => /\b(localStorage|sessionStorage)\b/.test(stripComments(file.text)))
    .map((file) => `${file.path}: обращение к хранилищу браузера вне src/platform/`);
  return result('localStorage используется только в src/platform/ (CLAUDE.md)', problems);
}

export function checkI18nKeys(
  ru: Record<string, unknown>,
  en: Record<string, unknown>,
): CheckResult {
  const ruKeys = new Set(Object.keys(ru));
  const enKeys = new Set(Object.keys(en));
  const problems = [
    ...[...ruKeys].filter((key) => !enKeys.has(key)).map((key) => `Нет перевода на en: ${key}`),
    ...[...enKeys].filter((key) => !ruKeys.has(key)).map((key) => `Нет перевода на ru: ${key}`),
  ];
  return result('Ключи ru.json и en.json совпадают (п. 8.2.3)', problems);
}

export function checkPurchases(catalog: unknown, iapIds: readonly string[]): CheckResult {
  const problems: string[] = [];
  if (!Array.isArray(catalog)) {
    return result('Покупки: purchases-catalog.json совпадает с config/iap.ts', [
      'purchases-catalog.json должен быть массивом покупок',
    ]);
  }
  const catalogIds: string[] = [];
  catalog.forEach((item: unknown, index) => {
    const product = item as Record<string, unknown> | null;
    if (typeof product?.id !== 'string') {
      problems.push(`Покупка №${index + 1} в каталоге без id`);
      return;
    }
    catalogIds.push(product.id);
    for (const field of ['title', 'description', 'price', 'priceValue', 'priceCurrencyCode']) {
      if (typeof product[field] !== 'string') problems.push(`${product.id}: нет поля ${field}`);
    }
  });
  for (const id of iapIds) {
    if (!catalogIds.includes(id)) problems.push(`${id} есть в config/iap.ts, но нет в каталоге`);
  }
  for (const id of catalogIds) {
    if (!iapIds.includes(id)) problems.push(`${id} есть в каталоге, но нет в config/iap.ts`);
  }
  const duplicates = catalogIds.filter((id, index) => catalogIds.indexOf(id) !== index);
  for (const id of new Set(duplicates)) problems.push(`${id} встречается в каталоге дважды`);
  return result('Покупки: purchases-catalog.json совпадает с config/iap.ts (п. 1.13.6)', problems);
}

/** Пункты раздела 18 диздока («Чек-лист перед модерацией»). */
export function designChecklist(designDoc: string): string[] {
  const section = /^## 18\.[^\n]*\n([\s\S]*?)(?=^## |\s*$(?![\s\S]))/m.exec(designDoc)?.[1] ?? '';
  return section
    .split('\n')
    .map((line) => /^- \[[ x]\] (.+)$/.exec(line.trim())?.[1])
    .filter((item): item is string => Boolean(item));
}

/** Ручные проверки из документации Яндекса, которых нет в разделе 18 диздока. */
export const EXTRA_MANUAL_CHECKS: readonly string[] = [
  'Системный плеер не появляется: на телефоне — в шторке уведомлений, на десктопе — кнопка управления медиа в браузере (п. 1.6.1.6, 1.6.2.5).',
  'С debug-панелью (debug-mode=16): Game Ready зеленеет на меню, индикатор языка 文 зелёный на старте, индикатор геймплея 🎮 меняется в забеге, на паузе, в меню и на рекламе (п. 1.19, 2.14).',
  'Моки валюты на debug-панели: цены в магазине показываются как TST и ¥ (п. 1.13.2).',
  'После покупки «без рекламы» пропадает вся реклама игры, включая стики-баннер; остаются только реклама за награду и стартовая реклама платформы (п. 1.13.5).',
  'Покупка не пропадает, если обновить страницу, не нажав «Хорошо» в окне оплаты (п. 1.13.1).',
  'Межуровневая реклама начинается не позже чем через 2 секунды после нажатия кнопки (п. 4.4).',
  'Договор заключён (ЕЛС или РСЯ), на вкладке «Инап-покупки» написано «Покупки подключены» — без этого игру не отправить на модерацию.',
  'Десктопные скриншоты 16:9: по бокам колонки не однотонный фон, а персонажи и подписи (п. 5.1.1.2). Горизонтальное видео 16:9 до 28 секунд загружено.',
];
