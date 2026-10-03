import { expect, test } from '@playwright/test';
import {
  e2eCall,
  e2eState,
  expectButtonsFit,
  expectNoPageScroll,
  getButtons,
  openGame,
  patchSave,
  press,
  screenshot,
  scrollToButton,
  useFakeSdk,
  VETERAN_SAVE,
  waitRun,
  waitScene,
  watchConsole,
} from './helpers';

interface ScreenSize {
  width: number;
  height: number;
  mobile: boolean;
  /** Сохранять скриншоты всех экранов (true) или только меню. */
  allScreens: boolean;
}

const SIZES: ScreenSize[] = [
  // Целевые разрешения из CLAUDE.md.
  { width: 360, height: 640, mobile: true, allScreens: true },
  { width: 390, height: 844, mobile: true, allScreens: true },
  { width: 844, height: 390, mobile: true, allScreens: true },
  { width: 768, height: 1024, mobile: true, allScreens: true },
  { width: 1280, height: 720, mobile: false, allScreens: true },
  { width: 1920, height: 1080, mobile: false, allScreens: true },
  // Методика модерации (п. 1.10): популярные разрешения и окно 16:9, сжатое на 20% по одной оси.
  { width: 1366, height: 768, mobile: false, allScreens: false },
  { width: 2560, height: 1080, mobile: false, allScreens: false },
  { width: 1920, height: 864, mobile: false, allScreens: false },
  { width: 1536, height: 1080, mobile: false, allScreens: false },
];

/** Клавиши всех 11 форм, две из них золотые: банка на скриншоте выглядит как посреди забега. */
const JAR_SAMPLE: [tier: number, x: number, y: number, golden: boolean][] = [
  [9, 120, 720, false],
  [10, 420, 720, true],
  [7, 90, 590, false],
  [8, 300, 600, false],
  [6, 500, 590, false],
  [5, 60, 470, false],
  [4, 200, 480, true],
  [3, 330, 470, false],
  [2, 450, 470, false],
  [1, 540, 470, false],
  [11, 300, 340, false],
];

/** Игрок с апгрейдами: на экране забега видны «Встряска», «Удаление» и второе «Далее». */
const UPGRADED_SAVE = {
  ...VETERAN_SAVE,
  coins: 2500,
  upgrades: { shake: 2, remove: 1, preview: 1, squish: 1, golden: 1, jar: 0 },
};

for (const size of SIZES) {
  const name = `${size.width}x${size.height}`;

  test.describe(name, () => {
    test.use({
      viewport: { width: size.width, height: size.height },
      deviceScaleFactor: size.mobile ? 2 : 1,
      isMobile: size.mobile,
      hasTouch: size.mobile,
    });

    test('меню помещается целиком, скриншоты', async ({ page }) => {
      const problems = watchConsole(page);
      for (const lang of ['ru', 'en']) {
        await openGame(page, { lang, seed: '7' });
        await expectNoPageScroll(page);
        await expectButtonsFit(page);
        if (lang === 'ru' || size.allScreens) await screenshot(page, `menu-${lang}-${name}`);
      }
      expect(problems).toEqual([]);
    });

    test('альбом и апгрейды помещаются целиком, скриншоты', async ({ page }) => {
      // На 768×1024 при DPR 2 без видеокарты кадры рисуются медленно, в параллельном прогоне — ещё медленнее.
      test.setTimeout(120_000);
      const problems = watchConsole(page);
      await openGame(page, { lang: 'ru', seed: '7' });
      await patchSave(page, {
        ...UPGRADED_SAVE,
        album: { classic: { forms: [1, 2, 3, 4, 5, 6, 7, 9], golden: [2, 4] } },
        achievements: ['first_clack', 'caps'],
      });
      await press(page, 'menu.album', size.mobile);
      await waitScene(page, 'Album');
      await expectNoPageScroll(page);
      await expectButtonsFit(page);
      if (size.allScreens) await screenshot(page, `album-ru-${name}`);
      await press(page, 'album.tab.medals', size.mobile);
      await expect
        .poll(async () => (await e2eState<{ tab: string } | null>(page, 'album'))?.tab)
        .toBe('medals');
      await expectButtonsFit(page);
      if (size.allScreens) await screenshot(page, `album-medals-ru-${name}`);
      await press(page, 'common.back', size.mobile);
      await waitScene(page, 'Menu');
      await press(page, 'menu.upgrades', size.mobile);
      await waitScene(page, 'Upgrades');
      await expectNoPageScroll(page);
      await expectButtonsFit(page);
      if (size.allScreens) await screenshot(page, `upgrades-ru-${name}`);
      expect(problems).toEqual([]);
    });

    test('забег, пауза и результат помещаются целиком, скриншоты', async ({ page }) => {
      // Без видеокарты WebGL рисует процессор: на 768×1024 при DPR 2 (холст 1536×2048) кадров
      // всего несколько в секунду, а в параллельном прогоне ещё меньше. Тесту нужно больше времени.
      test.setTimeout(150_000);
      const problems = watchConsole(page);
      await openGame(page, { lang: 'ru', seed: '7' });
      await patchSave(page, UPGRADED_SAVE);
      await press(page, 'menu.play', size.mobile);
      await waitScene(page, 'Game');
      for (const [tier, x, y, golden] of JAR_SAMPLE) {
        await e2eCall(page, 'placeKey', tier, x, y, golden);
      }
      await e2eCall(page, 'setCurrent', 3);
      await e2eCall(page, 'step', 240);
      await e2eCall(page, 'freeze', true);
      await expectNoPageScroll(page);
      await expectButtonsFit(page);
      if (size.allScreens) await screenshot(page, `game-ru-${name}`);

      await press(page, 'game.pause', size.mobile);
      await waitScene(page, 'Pause');
      await expectButtonsFit(page);
      if (size.allScreens) await screenshot(page, `pause-ru-${name}`);

      await press(page, 'pause.continue', size.mobile);
      await waitScene(page, 'Game');
      await e2eCall(page, 'endRun');
      await waitScene(page, 'Result', 60_000);
      await expectNoPageScroll(page);
      await expectButtonsFit(page);
      if (size.allScreens) await screenshot(page, `result-ru-${name}`);

      expect(problems).toEqual([]);
    });

    test('магазин помещается целиком, скриншоты', async ({ page }) => {
      test.skip(!size.allScreens, 'только целевые разрешения');
      test.setTimeout(120_000);
      const problems = watchConsole(page);
      // Товары и цены приходят из каталога SDK: берём поддельный SDK.
      await useFakeSdk(page);
      await openGame(page, { seed: '7' });
      await patchSave(page, { ...VETERAN_SAVE, coins: 1250 });
      await press(page, 'menu.shop', size.mobile);
      await waitScene(page, 'Shop');
      await expect
        .poll(async () => {
          const shop = await e2eState<{ cards: { currencyIcon: boolean }[] } | null>(page, 'shop');
          return (shop?.cards.length ?? 0) > 0 && shop!.cards.every((card) => card.currencyIcon);
        })
        .toBe(true);
      await expectNoPageScroll(page);
      await expectButtonsFit(page);
      await screenshot(page, `shop-ru-${name}`);
      expect(problems).toEqual([]);
    });

    test('меню с кнопкой «На рабочий стол» помещается, скриншоты', async ({ page }) => {
      test.skip(!size.allScreens, 'только целевые разрешения');
      test.setTimeout(120_000);
      const problems = watchConsole(page);
      // Кнопку показывают после пятого забега, если площадка разрешает ярлык.
      await useFakeSdk(page);
      await openGame(page, { seed: '7' });
      await patchSave(page, { ...VETERAN_SAVE, coins: 940, stats: { bestScore: 900, runs: 5 } });
      await page.reload();
      await waitScene(page, 'Menu');
      await expect
        .poll(async () => (await getButtons(page)).map((button) => button.id))
        .toContain('menu.shortcut');
      await expectNoPageScroll(page);
      await expectButtonsFit(page);
      await screenshot(page, `menu-shortcut-ru-${name}`);
      expect(problems).toEqual([]);
    });

    test('рекорды помещаются целиком, скриншоты', async ({ page }) => {
      test.skip(!size.allScreens, 'только целевые разрешения');
      test.setTimeout(120_000);
      const problems = watchConsole(page);
      // Таблица приходит из SDK: берём поддельный SDK с соперниками.
      await useFakeSdk(page);
      await openGame(page, { seed: '7' });
      await patchSave(page, { ...VETERAN_SAVE, stats: { bestScore: 6000, runs: 3 } });
      await press(page, 'menu.leaderboard', size.mobile);
      await waitScene(page, 'Leaderboard');
      const rows = (self: boolean) =>
        expect
          .poll(async () => {
            const board = await e2eState<{ rows: { self: boolean }[] } | null>(page, 'leaderboard');
            return (board?.rows.length ?? 0) >= 10 && board!.rows.some((row) => row.self) === self;
          })
          .toBe(true);
      await rows(false);
      await expectNoPageScroll(page);
      await expectButtonsFit(page);
      await screenshot(page, `leaderboard-ru-${name}`);
      // После входа своя строка подсвечена, кнопки входа больше нет.
      await press(page, 'leaderboard.signIn', size.mobile);
      await rows(true);
      await expectButtonsFit(page);
      await screenshot(page, `leaderboard-signed-ru-${name}`);
      expect(problems).toEqual([]);
    });

    test('миры, задания и украшения помещаются целиком, скриншоты', async ({ page }) => {
      test.skip(!size.allScreens, 'только целевые разрешения');
      test.setTimeout(180_000);
      const problems = watchConsole(page);
      // Товары магазина приходят из каталога SDK: берём поддельный SDK.
      await useFakeSdk(page);
      await openGame(page, { lang: 'ru', seed: '7' });
      const today = await e2eState<number>(page, 'today');
      // Второй мир открыт Пробелом классики, на третий монет пока не хватает.
      await patchSave(page, {
        ...VETERAN_SAVE,
        coins: 3200,
        purchases: { noAds: false, skinsPack: true, granted: [] },
        decor: { jar: 'candy', background: 'world' },
        daily: {
          day: today,
          task: { world: 'classic', tier: 8 },
          taskDone: false,
          gift: false,
          adGift: false,
          streak: 3,
          lastDone: today - 1,
          bestStreak: 3,
        },
      });
      await press(page, 'menu.world', size.mobile);
      await waitScene(page, 'Worlds');
      await expectNoPageScroll(page);
      await expectButtonsFit(page);
      await screenshot(page, `worlds-ru-${name}`);
      await press(page, 'common.back', size.mobile);
      await waitScene(page, 'Menu');
      await press(page, 'menu.daily', size.mobile);
      await waitScene(page, 'Daily');
      await expectNoPageScroll(page);
      await expectButtonsFit(page);
      await screenshot(page, `daily-ru-${name}`);
      await press(page, 'common.back', size.mobile);
      await waitScene(page, 'Menu');
      await press(page, 'menu.shop', size.mobile);
      await waitScene(page, 'Shop');
      await expect
        .poll(async () => (await e2eState<{ cards: unknown[] } | null>(page, 'shop'))?.cards.length)
        .toBe(3);
      await scrollToButton(page, 'decor.jar.stars');
      await expectButtonsFit(page);
      await screenshot(page, `shop-decor-ru-${name}`);
      expect(problems).toEqual([]);
    });

    test('забег в мирах 2 и 3 с подсказкой про особую клавишу, скриншоты', async ({ page }) => {
      test.skip(!size.allScreens, 'только целевые разрешения');
      test.setTimeout(240_000);
      const problems = watchConsole(page);
      await openGame(page, { lang: 'ru', seed: '7' });
      for (const [world, special] of [
        ['candy', 'caramel'],
        ['space', 'meteor'],
      ] as const) {
        await patchSave(page, {
          ...UPGRADED_SAVE,
          tutorial: { done: true, squish: true, caramel: false, meteor: false },
          worlds: { selected: world, bought: ['candy', 'space'] },
        });
        await page.reload();
        await waitScene(page, 'Menu');
        await press(page, 'menu.play', size.mobile);
        await waitScene(page, 'Game');
        for (const [tier, x, y, golden] of JAR_SAMPLE) {
          await e2eCall(page, 'placeKey', tier, x, y, golden);
        }
        await e2eCall(page, 'setSpecial', special, 3);
        await e2eCall(page, 'step', 240);
        await e2eCall(page, 'freeze', true);
        await waitRun(page, (state) => state.world === world && state.specialHint === special);
        await expectNoPageScroll(page);
        await expectButtonsFit(page);
        await screenshot(page, `game-${world}-ru-${name}`);
        // Забег закончен — после перезагрузки меню не спросит «Продолжить забег?».
        await e2eCall(page, 'freeze', false);
        await e2eCall(page, 'endRun');
        await waitScene(page, 'Result', 60_000);
      }
      expect(problems).toEqual([]);
    });

    test('предложения за рекламу и «×2 монеты» помещаются, скриншоты', async ({ page }) => {
      test.skip(!size.allScreens, 'только целевые разрешения');
      test.setTimeout(240_000);
      const problems = watchConsole(page);
      await openGame(page, { lang: 'ru', seed: '7' });
      await patchSave(page, { ...VETERAN_SAVE, upgrades: { shake: 1, remove: 1 } });
      await press(page, 'menu.play', size.mobile);
      await waitScene(page, 'Game');
      // Две Стрелочки сольются: за забег будут монеты и кнопка «×2» на экране результата.
      await e2eCall(page, 'placeKey', 5, 250, 740);
      await e2eCall(page, 'placeKey', 5, 340, 740);
      await press(page, 'game.shake', size.mobile);
      await waitRun(page, (state) => state.charges.shakes === 0 && state.coins > 0);
      await press(page, 'game.shake', size.mobile);
      await waitScene(page, 'Offer');
      await expectButtonsFit(page);
      await screenshot(page, `offer-tool-ru-${name}`);
      await press(page, 'offer.decline', size.mobile);
      await waitScene(page, 'Game');

      let y = 800;
      for (let i = 0; i < 10; i += 1) {
        const tier = i % 2 === 0 ? 5 : 4;
        const height = tier === 5 ? 100 : 85;
        await e2eCall(page, 'placeKey', tier, 470, y - height / 2 - 1);
        y -= height + 2;
      }
      await waitScene(page, 'Offer', 60_000);
      await expectButtonsFit(page);
      await screenshot(page, `offer-chance-ru-${name}`);
      await press(page, 'offer.decline', size.mobile);
      await waitScene(page, 'Result', 60_000);
      await expectNoPageScroll(page);
      await expectButtonsFit(page);
      await screenshot(page, `result-double-ru-${name}`);
      expect(problems).toEqual([]);
    });
  });
}
