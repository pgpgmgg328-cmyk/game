import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  SDK_TAG,
  checkFileNames,
  checkForbiddenCode,
  checkI18nKeys,
  checkIndexAtRoot,
  checkMonetization,
  checkPurchases,
  checkSdkCalls,
  checkSdkTag,
  checkSize,
  checkStorageOutsidePlatform,
  designChecklist,
} from '../scripts/lib/moderation.ts';
import { IAP_PRODUCTS } from '../src/config/iap';

const file = (path: string, size = 10) => ({ path, size });
const GOOD_HTML = `<!doctype html><html><head><title>t</title>${SDK_TAG}<script type="module" src="./assets/index.js"></script></head><body></body></html>`;

describe('правила npm run moderation', () => {
  it('index.html в корне', () => {
    expect(checkIndexAtRoot([file('index.html')]).problems).toEqual([]);
    expect(checkIndexAtRoot([file('game/index.html')]).problems).toHaveLength(1);
  });

  it('имена файлов латиницей без пробелов', () => {
    expect(checkFileNames([file('assets/index-AbC_1.js')]).problems).toEqual([]);
    expect(checkFileNames([file('assets/my file.js'), file('звук.mp3')]).problems).toHaveLength(2);
  });

  it('размер: цель 5 МБ и жёсткий лимит 100 МБ', () => {
    const MB = 1024 * 1024;
    expect(checkSize([file('a', 2 * MB)]).problems).toEqual([]);
    expect(checkSize([file('a', 6 * MB)]).problems[0]).toMatch(/наша цель/);
    expect(checkSize([file('a', 101 * MB)]).problems[0]).toMatch(/не больше 100\.00 МБ/);
  });

  it('тег /sdk.js в head, один, раньше скрипта игры и без изменений', () => {
    expect(checkSdkTag(GOOD_HTML).problems).toEqual([]);
    expect(checkSdkTag(GOOD_HTML.replace(SDK_TAG, '')).problems.length).toBeGreaterThan(0);
    expect(
      checkSdkTag(GOOD_HTML.replace(SDK_TAG, '<script src="./sdk.js"></script>')).problems.length,
    ).toBeGreaterThan(0);
    expect(
      checkSdkTag(GOOD_HTML.replace(SDK_TAG, '<script async src="/sdk.js"></script>')).problems
        .length,
    ).toBeGreaterThan(0);
    const late = GOOD_HTML.replace(SDK_TAG, '').replace('</body>', `${SDK_TAG}</body>`);
    expect(checkSdkTag(late).problems).toContain(`Тег ${SDK_TAG} должен стоять в <head>`);
    const moduleFirst = `<html><head><script type="module" src="./a.js"></script>${SDK_TAG}</head></html>`;
    expect(checkSdkTag(moduleFirst).problems).toContain('Скрипт игры подключён раньше /sdk.js');
  });

  it('вызовы LoadingAPI.ready и GameplayAPI', () => {
    const source =
      'sdk.features.LoadingAPI?.ready(); f.GameplayAPI?.start(); f.GameplayAPI?.stop();';
    expect(checkSdkCalls('LoadingAPI GameplayAPI', source).problems).toEqual([]);
    expect(checkSdkCalls('GameplayAPI', source).problems).toEqual([
      'В сборке нет обращений к LoadingAPI',
    ]);
    expect(checkSdkCalls('LoadingAPI GameplayAPI', 'f.GameplayAPI.start()').problems).toHaveLength(
      2,
    );
  });

  it('покупки консумируются, валюта и реклама — через SDK', () => {
    const platform = readFileSync(
      fileURLToPath(new URL('../src/platform/YandexPlatform.ts', import.meta.url)),
      'utf8',
    );
    expect(checkMonetization(platform).problems).toEqual([]);
    expect(checkMonetization('payments.getPurchases(); showFullscreenAdv({})').problems).toEqual([
      'В YandexPlatform нет payments.consumePurchase()',
      'В YandexPlatform нет payments.getCatalog()',
      'В YandexPlatform нет getPriceCurrencyImage()',
      'В YandexPlatform нет adv.showRewardedVideo()',
      'В YandexPlatform нет колбэк onRewarded',
      'В YandexPlatform нет adv.hideBannerAdv()',
    ]);
  });

  it('внешние адреса, window.open, <a href> и S3 Яндекса', () => {
    const ok = checkForbiddenCode([
      {
        path: 'a.js',
        text: 'createElementNS("http://www.w3.org/2000/svg","svg"); x="https://phaser.io/"',
      },
    ]);
    expect(ok.problems).toEqual([]);
    const bad = checkForbiddenCode([
      {
        path: 'a.js',
        text: 'fetch("https://evil.example/api"); window.open(u); h="<a href=\'x\'>"',
      },
      { path: 'b.js', text: 'img.src="https://games.s3.yandex.net/x.png"' },
    ]);
    expect(bad.problems).toEqual([
      'a.js: внешний адрес https://evil.example/api',
      'a.js: window.open',
      'a.js: ссылка <a href>',
      'b.js: внешний адрес https://games.s3.yandex.net/x.png',
      'b.js: абсолютный адрес на S3 Яндекса (п. 1.7)',
    ]);
  });

  it('localStorage только в src/platform/, упоминания в комментариях не считаются', () => {
    const sources = [
      { path: 'src/platform/localCache.ts', text: 'window.localStorage.getItem(k)' },
      {
        path: 'src/core/a.ts',
        text: '// localStorage здесь нельзя\n/* sessionStorage */ const a = 1;',
      },
    ];
    expect(checkStorageOutsidePlatform(sources).problems).toEqual([]);
    expect(
      checkStorageOutsidePlatform([{ path: 'src/game/b.ts', text: 'localStorage.setItem(k, v)' }])
        .problems,
    ).toEqual(['src/game/b.ts: обращение к хранилищу браузера вне src/platform/']);
  });

  it('ключи ru и en', () => {
    expect(checkI18nKeys({ a: '1', b: '2' }, { b: '2', a: '1' }).problems).toEqual([]);
    expect(checkI18nKeys({ a: '1', b: '2' }, { a: '1', c: '3' }).problems).toEqual([
      'Нет перевода на en: b',
      'Нет перевода на ru: c',
    ]);
  });

  it('каталог покупок совпадает с config/iap.ts', () => {
    const product = (id: string) => ({
      id,
      title: 't',
      description: 'd',
      price: '1 YAN',
      priceValue: '1',
      priceCurrencyCode: 'YAN',
    });
    expect(checkPurchases([product('a'), product('b')], ['b', 'a']).problems).toEqual([]);
    expect(checkPurchases([product('a'), product('a'), product('c')], ['a', 'b']).problems).toEqual(
      [
        'b есть в config/iap.ts, но нет в каталоге',
        'c есть в каталоге, но нет в config/iap.ts',
        'a встречается в каталоге дважды',
      ],
    );
    expect(checkPurchases({}, ['a']).problems).toHaveLength(1);
    expect(checkPurchases([{ id: 'a' }], ['a']).problems).toContain('a: нет поля price');
  });

  it('настоящий каталог и config/iap.ts совпадают', () => {
    const catalog: unknown = JSON.parse(readFileSync('purchases-catalog.json', 'utf8'));
    expect(
      checkPurchases(
        catalog,
        IAP_PRODUCTS.map((item) => item.id),
      ).problems,
    ).toEqual([]);
  });

  it('чек-лист берётся из раздела 18 диздока', () => {
    const items = designChecklist(readFileSync('docs/GAME_DESIGN.md', 'utf8'));
    expect(items.length).toBeGreaterThanOrEqual(10);
    expect(items[0]).toMatch(/^Игра запускается без ошибок в консоли/);
    expect(items.at(-1)).toBe('Возрастной рейтинг 0+.');
  });
});
