import { expect, test } from '@playwright/test';
import {
  e2eState,
  emitSdk as emit,
  getButton,
  openGame,
  press,
  sdkCalls,
  sdkNames as names,
  useFakeSdk,
  waitScene,
  watchConsole,
} from './helpers';

test.describe('SDK Яндекса (поддельный)', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test.beforeEach(async ({ page }) => {
    await useFakeSdk(page);
  });

  test('LoadingAPI.ready вызывается один раз и только когда меню на экране', async ({ page }) => {
    const problems = watchConsole(page);
    await openGame(page);
    await press(page, 'menu.settings');
    await waitScene(page, 'Settings');
    await press(page, 'common.back');
    await waitScene(page, 'Menu');

    const calls = await sdkCalls(page);
    expect(calls[0]?.name).toBe('init');
    const ready = calls.filter((call) => call.name === 'LoadingAPI.ready');
    expect(ready).toHaveLength(1);
    expect(ready[0]?.scene).toBe('Menu');
    // К моменту ready сохранения уже прочитаны.
    const readyIndex = calls.findIndex((call) => call.name === 'LoadingAPI.ready');
    expect(calls.findIndex((call) => call.name === 'getData')).toBeLessThan(readyIndex);
    expect(problems).toEqual([]);
  });

  for (const [sdkLang, play, htmlLang] of [
    ['ru', 'ИГРАТЬ', 'ru'],
    ['kk', 'ИГРАТЬ', 'ru'],
    ['en', 'PLAY', 'en'],
    ['tr', 'PLAY', 'en'],
  ] as const) {
    test(`язык площадки ${sdkLang} → ${htmlLang}`, async ({ page }) => {
      await openGame(page, { sdklang: sdkLang });
      expect((await getButton(page, 'menu.play')).label).toBe(play);
      expect(await page.evaluate(() => document.documentElement.lang)).toBe(htmlLang);
      expect(await page.title()).toBe(
        htmlLang === 'ru' ? 'Сквиши Клавиши: Мерж до Пробела' : 'Squishy Keys: Merge to Spacebar',
      );
    });
  }

  test('разметка геймплея: старт в забеге, стоп на паузе и при выходе в меню', async ({ page }) => {
    await openGame(page);
    expect(await names(page, 'GameplayAPI')).toEqual([]);
    await press(page, 'menu.play');
    await waitScene(page, 'Game');
    await press(page, 'game.pause');
    await waitScene(page, 'Pause');
    await press(page, 'pause.continue');
    await waitScene(page, 'Game');
    await press(page, 'game.pause');
    await waitScene(page, 'Pause');
    await press(page, 'pause.menu');
    await waitScene(page, 'Menu');
    expect(await names(page, 'GameplayAPI')).toEqual([
      'GameplayAPI.start',
      'GameplayAPI.stop',
      'GameplayAPI.start',
      'GameplayAPI.stop',
    ]);

    // Переходы по меню — не игровой процесс: новых вызовов разметки нет.
    await press(page, 'menu.settings');
    await waitScene(page, 'Settings');
    await press(page, 'common.back');
    await waitScene(page, 'Menu');
    expect(await names(page, 'GameplayAPI')).toHaveLength(4);
  });

  test('game_api_pause и game_api_resume ставят забег на паузу и снимают её', async ({ page }) => {
    await openGame(page);
    await press(page, 'menu.play');
    await waitScene(page, 'Game');

    await emit(page, 'game_api_pause');
    expect(await e2eState(page, 'paused')).toBe(true);
    await emit(page, 'game_api_resume');
    expect(await e2eState(page, 'paused')).toBe(false);
    expect(await names(page, 'GameplayAPI')).toEqual([
      'GameplayAPI.start',
      'GameplayAPI.stop',
      'GameplayAPI.start',
    ]);

    // Игрок сам поставил паузу: возврат из рекламы её не снимает.
    await press(page, 'game.pause');
    await waitScene(page, 'Pause');
    await emit(page, 'game_api_pause');
    await emit(page, 'game_api_resume');
    expect(await e2eState(page, 'paused')).toBe(true);
    expect(await e2eState(page, 'scene')).toBe('Pause');
    expect((await names(page, 'GameplayAPI')).at(-1)).toBe('GameplayAPI.stop');
  });

  test('облачные сохранения: запись с задержкой до секунды, при скрытии вкладки — сразу', async ({
    page,
  }) => {
    await openGame(page);
    await press(page, 'menu.settings');
    await waitScene(page, 'Settings');

    await press(page, 'settings.sound');
    await expect.poll(() => names(page, 'setData'), { timeout: 3000 }).toEqual(['setData:true']);

    await press(page, 'settings.music');
    const counts = await page.evaluate(() => {
      const count = () =>
        (window as unknown as { __fakeSdk: { calls: { name: string }[] } }).__fakeSdk.calls.filter(
          (call) => call.name.startsWith('setData'),
        ).length;
      const before = count();
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));
      return { before, after: count() };
    });
    expect(counts.after).toBe(counts.before + 1);

    // Без локального кэша прогресс восстанавливается из облака.
    await page.evaluate(() => localStorage.removeItem('squishy-keys:save'));
    await page.reload();
    await waitScene(page, 'Menu');
    expect(await e2eState(page, 'settings')).toEqual({ sound: false, music: false });
  });

  test('если SDK не запустился, игра всё равно открывается без ошибок', async ({ page }) => {
    await page.unroute('**/sdk.js');
    await page.route('**/sdk.js', (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        body: 'window.YaGames = { init: function () { return Promise.reject(new Error("offline")); } };',
      }),
    );
    const problems = watchConsole(page);
    await openGame(page);
    await press(page, 'menu.play');
    await waitScene(page, 'Game');
    expect(problems).toEqual([]);
  });
});
