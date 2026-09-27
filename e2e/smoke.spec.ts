import { expect, test, type Page } from '@playwright/test';
import {
  e2eState,
  expectButtonsFit,
  expectNoPageScroll,
  getButton,
  openGame,
  press,
  waitScene,
  watchConsole,
} from './helpers';

async function setVisibility(page: Page, state: 'hidden' | 'visible'): Promise<void> {
  await page.evaluate((value) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => value });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}

async function resize(page: Page, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.waitForFunction(
    ([w, h]) => {
      const canvas = document.querySelector('canvas')!.getBoundingClientRect();
      return Math.round(canvas.width) === w && Math.round(canvas.height) === h;
    },
    [width, height],
  );
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

test.describe('без SDK (LocalPlatform)', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('все экраны открываются и закрываются без ошибок', async ({ page }) => {
    const problems = watchConsole(page);
    await openGame(page, { lang: 'ru' });
    const screens: [string, string][] = [
      ['menu.worlds', 'Worlds'],
      ['menu.album', 'Album'],
      ['menu.upgrades', 'Upgrades'],
      ['menu.shop', 'Shop'],
      ['menu.leaderboard', 'Leaderboard'],
      ['menu.settings', 'Settings'],
    ];
    for (const [button, scene] of screens) {
      await press(page, button);
      await waitScene(page, scene);
      await expectButtonsFit(page);
      await press(page, 'common.back');
      await waitScene(page, 'Menu');
    }
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
    expect(problems).toEqual([]);
  });

  test('Space и Enter нажимают главную кнопку экрана', async ({ page }) => {
    await openGame(page);
    await page.keyboard.press('Space');
    await waitScene(page, 'Game');
    await press(page, 'game.pause');
    await waitScene(page, 'Pause');
    await page.keyboard.press('Enter');
    await waitScene(page, 'Game');
    expect(await e2eState(page, 'paused')).toBe(false);
  });

  test('настройки сохраняются сразу и переживают перезагрузку', async ({ page }) => {
    await openGame(page, { lang: 'ru' });
    await press(page, 'menu.settings');
    await waitScene(page, 'Settings');
    await press(page, 'settings.music');
    expect((await getButton(page, 'settings.music')).label).toBe('Музыка: выкл');
    await page.reload();
    await waitScene(page, 'Menu');
    expect(await e2eState(page, 'settings')).toEqual({ sound: true, music: false });
    await press(page, 'menu.settings');
    await waitScene(page, 'Settings');
    expect((await getButton(page, 'settings.music')).label).toBe('Музыка: выкл');
  });

  test('страница не прокручивается, текст не выделяется, контекстного меню нет', async ({
    page,
  }) => {
    await openGame(page);
    const styles = await page.evaluate(() => {
      const style = getComputedStyle(document.body);
      return {
        touchAction: style.touchAction,
        userSelect: style.userSelect,
        overscroll: style.overscrollBehavior,
      };
    });
    expect(styles).toEqual({ touchAction: 'none', userSelect: 'none', overscroll: 'none' });
    const contextMenuBlocked = await page.evaluate(() => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      document.querySelector('canvas')!.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(contextMenuBlocked).toBe(true);
    await page.mouse.move(640, 360);
    await page.mouse.wheel(0, 800);
    await page.keyboard.press('PageDown');
    expect(await page.evaluate(() => [window.scrollX, window.scrollY])).toEqual([0, 0]);
  });

  test('потеря фокуса и скрытие вкладки ставят забег на паузу, возврат продолжает', async ({
    page,
  }) => {
    await openGame(page);
    await press(page, 'menu.play');
    await waitScene(page, 'Game');
    expect(await e2eState(page, 'gameplayActive')).toBe(true);

    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    expect(await e2eState(page, 'paused')).toBe(true);
    expect(await e2eState(page, 'gameplayActive')).toBe(false);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    expect(await e2eState(page, 'gameplayActive')).toBe(true);

    await setVisibility(page, 'hidden');
    expect(await e2eState(page, 'paused')).toBe(true);
    await setVisibility(page, 'visible');
    expect(await e2eState(page, 'paused')).toBe(false);
    expect(await e2eState(page, 'scene')).toBe('Game');
  });
});

test.describe('поворот экрана', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });

  test('экран и его состояние сохраняются при повороте', async ({ page }) => {
    const problems = watchConsole(page);
    await openGame(page, { lang: 'ru' });
    await press(page, 'menu.settings', true);
    await waitScene(page, 'Settings');
    await press(page, 'settings.sound', true);
    const label = (await getButton(page, 'settings.sound')).label;
    expect(label).toBe('Звук: выкл');

    for (const [width, height] of [
      [844, 390],
      [390, 844],
    ] as const) {
      await resize(page, width, height);
      expect(await e2eState(page, 'scene')).toBe('Settings');
      expect((await getButton(page, 'settings.sound')).label).toBe(label);
      await expectNoPageScroll(page);
      await expectButtonsFit(page);
    }

    // Пауза посреди забега тоже переживает поворот.
    await press(page, 'common.back', true);
    await waitScene(page, 'Menu');
    await press(page, 'menu.play', true);
    await waitScene(page, 'Game');
    await press(page, 'game.pause', true);
    await waitScene(page, 'Pause');
    await resize(page, 844, 390);
    expect(await e2eState(page, 'scene')).toBe('Pause');
    expect(await e2eState(page, 'paused')).toBe(true);
    await expectButtonsFit(page);
    expect(problems).toEqual([]);
  });
});
