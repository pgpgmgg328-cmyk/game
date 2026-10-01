import { expect, test, type Page } from '@playwright/test';
import {
  VETERAN_SAVE,
  e2eCall,
  e2eState,
  openGame,
  patchSave,
  press,
  sdkCalls,
  sdkNames,
  useFakeSdk,
  waitScene,
  watchConsole,
} from './helpers';

/** Доиграть забег до экрана результата. runsBefore — сколько забегов было до этого. */
async function finishRun(page: Page, runsBefore: number, extra: Record<string, unknown> = {}) {
  await patchSave(page, {
    ...VETERAN_SAVE,
    stats: { bestScore: 0, runs: runsBefore },
    ...extra,
  });
  await press(page, 'menu.play');
  await waitScene(page, 'Game');
  await e2eCall(page, 'endRun');
  await waitScene(page, 'Result');
}

test.describe('полноэкранная реклама (поддельный SDK)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await useFakeSdk(page);
  });

  test('после третьего забега «Ещё раз» показывает рекламу, игра на паузе и без звука', async ({
    page,
  }) => {
    const problems = watchConsole(page);
    await openGame(page);
    await finishRun(page, 2);
    await press(page, 'result.again');
    await expect.poll(() => e2eState<{ busy: boolean }>(page, 'ads')).toMatchObject({ busy: true });
    expect(await e2eState(page, 'paused')).toBe(true);
    expect(await e2eState(page, 'muted')).toBe(true);
    await waitScene(page, 'Game');

    const calls = await sdkCalls(page);
    const ad = calls.findIndex((call) => call.name === 'adv.fullscreen');
    const closed = calls.findIndex((call) => call.name === 'adv.fullscreen:close');
    expect(calls[ad]?.scene).toBe('Result');
    // Новый забег начинается только после закрытия рекламы.
    const start = calls.findIndex((call, index) => index > ad && call.name === 'GameplayAPI.start');
    expect(start).toBeGreaterThan(closed);
    expect(await e2eState(page, 'paused')).toBe(false);
    expect(problems).toEqual([]);
  });

  test('в первые два забега рекламы нет', async ({ page }) => {
    await openGame(page);
    await finishRun(page, 0);
    await press(page, 'result.again');
    await waitScene(page, 'Game');
    await e2eCall(page, 'endRun');
    await waitScene(page, 'Result');
    await press(page, 'result.menu');
    await waitScene(page, 'Menu');
    expect(await sdkNames(page, 'adv.fullscreen')).toEqual([]);
  });

  test('после покупки «Без рекламы» полноэкранной рекламы нет', async ({ page }) => {
    await openGame(page);
    await finishRun(page, 10, { purchases: { noAds: true, skinsPack: false, granted: [] } });
    await press(page, 'result.menu');
    await waitScene(page, 'Menu');
    expect(await sdkNames(page, 'adv.fullscreen')).toEqual([]);
  });

  test('не чаще раза в 90 секунд', async ({ page }) => {
    await openGame(page);
    await finishRun(page, 5);
    await press(page, 'result.menu');
    await waitScene(page, 'Menu');
    await finishRun(page, 6);
    await press(page, 'result.menu');
    await waitScene(page, 'Menu');
    expect(await sdkNames(page, 'adv.fullscreen')).toEqual([
      'adv.fullscreen',
      'adv.fullscreen:close',
    ]);
  });

  test('реклама недоступна — игра просто идёт дальше', async ({ page }) => {
    const problems = watchConsole(page);
    await openGame(page, { sdkads: 'error' });
    await finishRun(page, 5);
    await press(page, 'result.again');
    await waitScene(page, 'Game');
    expect(await sdkNames(page, 'adv.fullscreen')).toEqual(['adv.fullscreen']);
    expect(await e2eState(page, 'paused')).toBe(false);
    expect(problems).toEqual([]);
  });
});
