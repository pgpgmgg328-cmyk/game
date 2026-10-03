import { expect, test, type Page } from '@playwright/test';
import {
  VETERAN_SAVE,
  e2eState,
  expectButtonsFit,
  expectNoPageScroll,
  getButtons,
  openGame,
  patchSave,
  press,
  scrollToButton,
  sdkCalls,
  sdkNames,
  useFakeSdk,
  waitScene,
  watchConsole,
} from './helpers';

interface ShopState {
  status: string | null;
  cards: { id: string; price: string; currencyIcon: boolean; owned: boolean }[];
  decor: { id: string; kind: string; owned: boolean; selected: boolean }[];
}

interface SaveState {
  coins: number;
  purchases: { noAds: boolean; skinsPack: boolean; granted: string[] };
  decor: { jar: string; background: string };
  daily: Record<string, unknown>;
}

const ids = (items: { id: string }[]): string[] => items.map((item) => item.id);

async function openShop(page: Page): Promise<ShopState> {
  await press(page, 'menu.shop');
  await waitScene(page, 'Shop');
  return pollShop(page, (shop) => shop.status === null || !shop.status.includes('…'));
}

async function pollShop(page: Page, check: (shop: ShopState) => boolean): Promise<ShopState> {
  let state: ShopState | null = null;
  await expect
    .poll(async () => {
      state = await e2eState<ShopState | null>(page, 'shop');
      return state !== null && check(state);
    })
    .toBe(true);
  return state!;
}

/** Покупки, которые площадка «помнит» (поддельный SDK хранит их в localStorage). */
async function setOwnedPurchases(page: Page, list: unknown[]): Promise<void> {
  await page.evaluate(
    (items) => localStorage.setItem('fake-sdk-purchases', JSON.stringify(items)),
    list,
  );
}

test.describe('покупки (поддельный SDK)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await useFakeSdk(page);
  });

  test('магазин: товары из каталога, цена с иконкой и кодом валюты из SDK', async ({ page }) => {
    const problems = watchConsole(page);
    await openGame(page);
    const shop = await pollShop(page, () => true).catch(() => null);
    expect(shop).toBeNull();
    const state = await openShop(page);
    expect(state.status).toBeNull();
    expect(state.cards.map((card) => card.id)).toEqual(['no_ads', 'skins_pack', 'coins_1000']);
    expect(state.cards.map((card) => card.price)).toEqual(['99 YAN', '49 YAN', '29 YAN']);
    // Украшения: у нового игрока есть только обычная банка и фон мира, они и выбраны.
    expect(ids(state.decor)).toEqual([
      'glass',
      'rainbow',
      'candy',
      'stars',
      'cloud',
      'world',
      'confetti',
      'clouds',
    ]);
    expect(ids(state.decor.filter((item) => item.owned))).toEqual(['glass', 'world']);
    expect(ids(state.decor.filter((item) => item.selected))).toEqual(['glass', 'world']);
    await pollShop(page, (shop) => shop.cards.every((card) => card.currencyIcon));
    await expectButtonsFit(page);
    expect(problems).toEqual([]);
  });

  test('1000 клацов: монеты сразу, запись в облако, потом консумирование', async ({ page }) => {
    const problems = watchConsole(page);
    await openGame(page);
    await openShop(page);
    const before = (await e2eState<SaveState>(page, 'save')).coins;
    await press(page, 'shop.buy.coins_1000');
    await expect
      .poll(async () => (await e2eState<SaveState>(page, 'save')).coins)
      .toBe(before + 1000);
    await expect.poll(() => sdkNames(page, 'payments.consume')).toHaveLength(1);
    const calls = (await sdkCalls(page)).map((call) => call.name);
    const bought = calls.indexOf('payments.purchase:coins_1000');
    const consumed = calls.indexOf('payments.consume:coins_1000');
    const written = calls.findIndex((name, index) => index > bought && name.startsWith('setData'));
    expect(written).toBeGreaterThan(bought);
    expect(consumed).toBeGreaterThan(written);
    expect((await e2eState<SaveState>(page, 'save')).purchases.granted).toEqual([]);
    // Расходуемую можно купить ещё раз.
    expect((await getButtons(page)).map((button) => button.id)).toContain('shop.buy.coins_1000');
    expect(problems).toEqual([]);
  });

  test('«Без рекламы»: баннер скрывается, полноэкранной рекламы нет, покупка навсегда', async ({
    page,
  }) => {
    await openGame(page);
    await expect.poll(() => sdkNames(page, 'adv.banner')).toEqual(['adv.banner:show']);
    await openShop(page);
    await press(page, 'shop.buy.no_ads');
    await pollShop(page, (shop) => shop.cards.find((card) => card.id === 'no_ads')!.owned);
    expect((await e2eState<SaveState>(page, 'save')).purchases.noAds).toBe(true);
    expect(await sdkNames(page, 'adv.banner')).toEqual(['adv.banner:show', 'adv.banner:hide']);
    expect(await sdkNames(page, 'payments.consume')).toEqual([]);
    expect((await getButtons(page)).map((button) => button.id)).not.toContain('shop.buy.no_ads');

    // После перезагрузки (даже без локального кэша) покупка на месте, баннер не показывается.
    await page.evaluate(() => localStorage.removeItem('squishy-keys:save'));
    await page.reload();
    await waitScene(page, 'Menu');
    await expect
      .poll(async () => (await e2eState<SaveState>(page, 'save')).purchases.noAds)
      .toBe(true);
    expect(await sdkNames(page, 'adv.banner')).not.toContain('adv.banner:show');
    expect(await e2eState(page, 'ads')).toMatchObject({ interstitialAllowed: false });
  });

  test('«Набор украшений»: банки и фоны открываются, выбор сохраняется и виден сразу', async ({
    page,
  }) => {
    const problems = watchConsole(page);
    await openGame(page);
    await openShop(page);
    await press(page, 'shop.buy.skins_pack');
    const bought = await pollShop(
      page,
      (shop) => shop.cards.find((card) => card.id === 'skins_pack')!.owned,
    );
    expect((await e2eState<SaveState>(page, 'save')).purchases.skinsPack).toBe(true);
    expect(await sdkNames(page, 'payments.consume')).toEqual([]);
    // Закрытой осталась только «Радуга» — она за неделю заданий подряд.
    expect(ids(bought.decor.filter((item) => !item.owned))).toEqual(['rainbow']);

    await scrollToButton(page, 'decor.jar.candy');
    await press(page, 'decor.jar.candy');
    await pollShop(page, (shop) => shop.decor.find((item) => item.id === 'candy')!.selected);
    await scrollToButton(page, 'decor.background.clouds');
    await expectButtonsFit(page);
    await press(page, 'decor.background.clouds');
    const chosen = await pollShop(
      page,
      (shop) => shop.decor.find((item) => item.id === 'clouds')!.selected,
    );
    expect(ids(chosen.decor.filter((item) => item.selected))).toEqual(['candy', 'clouds']);
    // Фон меняется сразу, выбор записан в сохранение.
    await expect.poll(() => e2eState(page, 'background')).toMatchObject({ skin: 'clouds' });
    expect((await e2eState<SaveState>(page, 'save')).decor).toEqual({
      jar: 'candy',
      background: 'clouds',
    });

    // После перезапуска (даже без локального кэша) фон тот же, а в забеге — банка «Леденец».
    await page.evaluate(() => localStorage.removeItem('squishy-keys:save'));
    await page.reload();
    await waitScene(page, 'Menu');
    await expect.poll(() => e2eState(page, 'background')).toMatchObject({ skin: 'clouds' });
    await press(page, 'menu.play');
    await waitScene(page, 'Game');
    await expect
      .poll(async () => (await e2eState<{ jar: string } | null>(page, 'run'))?.jar)
      .toBe('candy');
    expect(problems).toEqual([]);
  });

  test('при запуске выдаёт оплаченную, но не выданную покупку — один раз', async ({ page }) => {
    await openGame(page);
    await patchSave(page, { ...VETERAN_SAVE, coins: 5 });
    await setOwnedPurchases(page, [
      { productID: 'coins_1000', purchaseToken: 'token-coins_1000-1', developerPayload: '' },
    ]);
    await page.reload();
    await waitScene(page, 'Menu');
    await expect.poll(async () => (await e2eState<SaveState>(page, 'save')).coins).toBe(1005);
    await expect.poll(() => sdkNames(page, 'payments.consume')).toHaveLength(1);
    await page.reload();
    await waitScene(page, 'Menu');
    await page.waitForTimeout(500);
    expect((await e2eState<SaveState>(page, 'save')).coins).toBe(1005);
  });

  test('консумирование не прошло — при следующем запуске монеты не выдаются второй раз', async ({
    page,
  }) => {
    await openGame(page, { sdkconsume: 'fail' });
    await openShop(page);
    await press(page, 'shop.buy.coins_1000');
    await expect.poll(async () => (await e2eState<SaveState>(page, 'save')).coins).toBe(1000);
    await expect.poll(() => sdkNames(page, 'payments.consume')).toHaveLength(1);
    expect((await e2eState<SaveState>(page, 'save')).purchases.granted).toHaveLength(1);
    await page.reload();
    await waitScene(page, 'Menu');
    // Покупка пришла снова: монеты не начислены второй раз, консумирование пробуем ещё раз.
    await expect.poll(() => sdkNames(page, 'payments.consume')).toHaveLength(1);
    await page.waitForTimeout(500);
    expect((await e2eState<SaveState>(page, 'save')).coins).toBe(1000);
  });

  test('окно оплаты закрыли — ничего не меняется', async ({ page }) => {
    const problems = watchConsole(page);
    await openGame(page, { sdkpurchase: 'cancel' });
    await openShop(page);
    await press(page, 'shop.buy.coins_1000');
    await expect.poll(() => sdkNames(page, 'payments.purchase')).toHaveLength(1);
    await page.waitForTimeout(300);
    expect((await e2eState<SaveState>(page, 'save')).coins).toBe(0);
    const buy = (await getButtons(page)).find((button) => button.id === 'shop.buy.coins_1000');
    expect(buy?.disabled).toBe(false);
    expect(problems).toEqual([]);
  });

  test('покупки не подключены — магазин честно говорит об этом', async ({ page }) => {
    await openGame(page, { sdkpay: 'none' });
    const state = await openShop(page);
    expect(state.status).toBe('Покупки пока недоступны');
    expect(state.cards).toEqual([]);
  });
});

test('без Яндекса покупок нет: магазин говорит, что они недоступны', async ({ page }) => {
  const problems = watchConsole(page);
  await openGame(page, { lang: 'ru' });
  const state = await openShop(page);
  expect(state.status).toBe('Покупки пока недоступны');
  await expectNoPageScroll(page);
  await expectButtonsFit(page);
  expect(problems).toEqual([]);
});

test('«Радуга» за неделю заданий выбирается и без покупок', async ({ page }) => {
  const problems = watchConsole(page);
  await openGame(page, { lang: 'ru' });
  const { daily } = await e2eState<SaveState>(page, 'save');
  await patchSave(page, { daily: { ...daily, bestStreak: 7 } });
  const state = await openShop(page);
  expect(ids(state.decor.filter((item) => item.owned))).toEqual(['glass', 'rainbow', 'world']);
  await scrollToButton(page, 'decor.jar.rainbow');
  await press(page, 'decor.jar.rainbow');
  await pollShop(page, (shop) => shop.decor.find((item) => item.id === 'rainbow')!.selected);
  expect((await e2eState<SaveState>(page, 'save')).decor.jar).toBe('rainbow');
  // Чужие украшения набора не выбираются: кнопок у них нет.
  const buttons = (await getButtons(page)).map((button) => button.id);
  expect(buttons.filter((id) => id.startsWith('decor.'))).not.toContain('decor.jar.candy');
  expect(problems).toEqual([]);
});
