import { expect, test, type Page } from '@playwright/test';
import {
  VETERAN_SAVE,
  e2eCall,
  e2eState,
  getButton,
  getButtons,
  openGame,
  patchSave,
  press,
  runState,
  sdkCalls,
  sdkNames,
  tapJar,
  useFakeSdk,
  waitRun,
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

/** Столбик из Стрелочек и Циферок выше линии опасности: через 2 с банка переполнится. */
async function overflowJar(page: Page): Promise<void> {
  let y = 800;
  for (let i = 0; i < 10; i += 1) {
    const tier = i % 2 === 0 ? 5 : 4;
    const height = tier === 5 ? 100 : 85;
    await e2eCall(page, 'placeKey', tier, 300, y - height / 2 - 1);
    y -= height + 2;
  }
}

async function startRun(page: Page, extra: Record<string, unknown> = {}): Promise<void> {
  await patchSave(page, { ...VETERAN_SAVE, ...extra });
  await press(page, 'menu.play');
  await waitScene(page, 'Game');
}

test.describe('реклама за награду (поддельный SDK)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await useFakeSdk(page);
  });

  test('«Второй шанс»: три верхние клавиши уходят, забег продолжается', async ({ page }) => {
    const problems = watchConsole(page);
    await openGame(page);
    await startRun(page);
    await overflowJar(page);
    await waitScene(page, 'Offer', 30_000);
    const before = await runState(page);
    expect(before).toMatchObject({ over: true, offering: true, ending: false });
    expect(await e2eState(page, 'gameplayActive')).toBe(false);
    expect((await getButton(page, 'offer.watch')).label).toBe('Реклама: ещё шанс');

    await press(page, 'offer.watch');
    await waitScene(page, 'Game');
    const after = await waitRun(page, (state) => !state.offering);
    expect(after.over).toBe(false);
    expect(after.bonuses.revive).toBe(true);
    expect(after.keys.length).toBe(before.keys.length - 3);
    expect(await e2eState(page, 'gameplayActive')).toBe(true);
    const ads = await sdkNames(page, 'adv.rewarded');
    expect(ads).toEqual(['adv.rewarded', 'adv.rewarded:onRewarded', 'adv.rewarded:close']);
    expect(problems).toEqual([]);
  });

  test('от «Второго шанса» можно отказаться — тогда экран результата', async ({ page }) => {
    await openGame(page);
    await startRun(page);
    await overflowJar(page);
    await waitScene(page, 'Offer', 30_000);
    await press(page, 'offer.decline');
    await waitScene(page, 'Result', 30_000);
    expect(await sdkNames(page, 'adv.rewarded')).toEqual([]);
  });

  test('флаг secondChanceEnabled=false выключает «Второй шанс»', async ({ page }) => {
    await openGame(page, { sdkflags: JSON.stringify({ secondChanceEnabled: 'false' }) });
    await startRun(page);
    await overflowJar(page);
    await waitScene(page, 'Result', 40_000);
  });

  test('реклама недоступна — кнопка так и говорит, отказаться можно', async ({ page }) => {
    const problems = watchConsole(page);
    await openGame(page, { sdkads: 'error' });
    await startRun(page);
    await overflowJar(page);
    await waitScene(page, 'Offer', 30_000);
    await press(page, 'offer.watch');
    await expect
      .poll(async () => (await getButton(page, 'offer.watch')).label)
      .toBe('Реклама пока недоступна');
    expect((await getButton(page, 'offer.watch')).disabled).toBe(true);
    expect((await getButton(page, 'offer.decline')).disabled).toBe(false);
    expect(await runState(page)).toMatchObject({ over: true, offering: true });
    await press(page, 'offer.decline');
    await waitScene(page, 'Result', 30_000);
    expect(problems).toEqual([]);
  });

  test('«+1 Встряска» за рекламу, когда заряды кончились, — раз за забег', async ({ page }) => {
    await openGame(page);
    await startRun(page, { upgrades: { shake: 1 } });
    await press(page, 'game.shake');
    await waitRun(page, (state) => state.charges.shakes === 0);
    expect(await e2eState(page, 'scene')).toBe('Game');

    await press(page, 'game.shake');
    await waitScene(page, 'Offer');
    expect(await e2eState(page, 'paused')).toBe(true);
    expect((await getButton(page, 'offer.watch')).label).toBe('Реклама: +1 Встряска');
    await press(page, 'offer.watch');
    await waitScene(page, 'Game');
    const state = await waitRun(page, (run) => run.charges.shakes === 1);
    expect(state.bonuses.shake).toBe(true);
    expect(await e2eState(page, 'paused')).toBe(false);

    await press(page, 'game.shake');
    await waitRun(page, (run) => run.charges.shakes === 0);
    // Бонус уже взят: кнопка бледная и больше ничего не предлагает.
    expect((await getButton(page, 'game.shake')).disabled).toBe(true);
    await press(page, 'game.shake');
    await page.waitForTimeout(300);
    expect(await e2eState(page, 'scene')).toBe('Game');
  });

  test('«Не сейчас» закрывает предложение и возвращает в забег', async ({ page }) => {
    await openGame(page);
    await startRun(page, { upgrades: { remove: 1 } });
    await e2eCall(page, 'placeKey', 3, 300, 760);
    await press(page, 'game.remove');
    const key = (await runState(page)).keys[0]!;
    await tapJar(page, key.x, key.y);
    await waitRun(page, (state) => state.charges.removes === 0);
    await press(page, 'game.remove');
    await waitScene(page, 'Offer');
    await press(page, 'offer.decline');
    await waitScene(page, 'Game');
    expect(await e2eState(page, 'paused')).toBe(false);
    expect((await runState(page)).bonuses.remove).toBe(false);
  });
});

test.describe('×2 монеты на экране результата', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test.describe.configure({ timeout: 120_000 });

  async function finishWithCoins(page: Page): Promise<number> {
    await startRun(page);
    // Две Стрелочки вплотную: сольются в Таб, и за забег будут монеты.
    await e2eCall(page, 'placeKey', 5, 250, 740);
    await e2eCall(page, 'placeKey', 5, 340, 740);
    await waitRun(page, (state) => state.coins > 0);
    await e2eCall(page, 'endRun');
    // Надпись «Банка переполнена!» держится 1,7 с игрового времени: без видеокарты это дольше.
    await waitScene(page, 'Result', 60_000);
    return (await e2eState<{ coins: number }>(page, 'save')).coins;
  }

  test('после рекламы монеты забега начисляются ещё раз (поддельный SDK)', async ({ page }) => {
    await useFakeSdk(page);
    await openGame(page);
    const wallet = await finishWithCoins(page);
    expect((await getButton(page, 'result.double')).label).toBe('Реклама: ×2 монеты');
    await press(page, 'result.double');
    await expect
      .poll(async () => (await getButtons(page)).map((button) => button.id))
      .not.toContain('result.double');
    const after = (await e2eState<{ coins: number }>(page, 'save')).coins;
    expect(after).toBeGreaterThan(wallet);
    expect(await sdkNames(page, 'adv.rewarded:onRewarded')).toHaveLength(1);
    // Сразу после рекламы за награду полноэкранной нет.
    await press(page, 'result.again');
    await waitScene(page, 'Game');
    expect(await sdkNames(page, 'adv.fullscreen')).toEqual([]);
  });

  test('локально реклама — заглушка на секунду, награда тоже приходит', async ({ page }) => {
    await openGame(page);
    const wallet = await finishWithCoins(page);
    await press(page, 'result.double');
    await expect
      .poll(async () => (await e2eState<{ coins: number }>(page, 'save')).coins, {
        timeout: 10_000,
      })
      .toBeGreaterThan(wallet);
  });
});
