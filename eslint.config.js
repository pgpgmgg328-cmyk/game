import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

const storageGlobals = [
  { name: 'localStorage', message: 'Хранилище браузера используется только внутри src/platform/.' },
  {
    name: 'sessionStorage',
    message: 'Хранилище браузера используется только внутри src/platform/.',
  },
  { name: 'YaGames', message: 'SDK Яндекса вызывается только внутри src/platform/.' },
];

// API, которых нет в iOS 12–15: сборка понижает только синтаксис, полифилов в игре нет.
// Остальное (Array.prototype.at, replaceAll и т. п.) отсекает lib ES2019 в tsconfig.app.json.
const legacyUnsafeGlobals = [
  {
    name: 'structuredClone',
    message: 'Нет в iOS младше 15.4. Для простых данных используйте JSON-копию.',
  },
];

const windowProperties = [
  {
    object: 'window',
    property: 'localStorage',
    message: 'Хранилище браузера используется только внутри src/platform/.',
  },
  {
    object: 'window',
    property: 'sessionStorage',
    message: 'Хранилище браузера используется только внутри src/platform/.',
  },
  {
    object: 'window',
    property: 'YaGames',
    message: 'SDK Яндекса вызывается только внутри src/platform/.',
  },
];

const noExternalLinks = {
  object: 'window',
  property: 'open',
  message: 'Внешние ссылки запрещены требованиями Яндекса (п. 8.4).',
};

export default defineConfig(
  globalIgnores([
    'dist/',
    'release/',
    'node_modules/',
    'test-results/',
    'playwright-report/',
    'docs/',
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      // Параметр с подчёркиванием — сознательно не используется (например, в реализации интерфейса).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', ...storageGlobals, ...legacyUnsafeGlobals],
      'no-restricted-properties': ['error', ...windowProperties, noExternalLinks],
    },
  },
  {
    // Единственное место, где разрешены SDK Яндекса и хранилище браузера.
    files: ['src/platform/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', ...legacyUnsafeGlobals],
      'no-restricted-properties': ['error', noExternalLinks],
    },
  },
  {
    // core/ — чистая логика: без Phaser и без браузерного окружения, чтобы тестировать её в Node.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: [{ name: 'phaser', message: 'core/ не должен зависеть от Phaser.' }] },
      ],
      'no-restricted-globals': [
        'error',
        ...storageGlobals,
        ...legacyUnsafeGlobals,
        { name: 'window', message: 'core/ не должен зависеть от браузера.' },
        { name: 'document', message: 'core/ не должен зависеть от браузера.' },
      ],
    },
  },
  {
    // Сцены знают только интерфейс Platform, а не конкретные реализации.
    files: ['src/game/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/platform/YandexPlatform*', '**/platform/LocalPlatform*'],
              message: 'Сцены работают только через интерфейс Platform.',
            },
          ],
        },
      ],
    },
  },
);
