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
  sdkCalls,
  sdkNames,
  useFakeSdk,
  waitScene,
  watchConsole,
} from './helpers';

interface ShopState {
  status: string | null;
  cards: { id: string; price: string; currencyIcon: boolean; owned: boolean }[];
}

interface SaveState {
  coins: number;
  purchases: { noAds: boolean; skinsPack: boolean; granted: string[] };
}

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
    // «Набор украшений» появится в M4 вместе со скинами.
    expect(state.cards.map((card) => card.id)).toEqual(['no_ads', 'coins_1000']);
    expect(state.cards.map((card) => card.price)).toEqual(['99 YAN', '29 YAN']);
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
