import { expect, test, type Page } from '@playwright/test';
import {
  e2eCall,
  expectButtonsFit,
  getButton,
  openGame,
  patchSave,
  press,
  runState,
  tapJar,
  VETERAN_SAVE,
  waitCanDrop,
  waitRun,
  waitScene,
  watchConsole,
} from './helpers';

/** Высота банки в единицах физики (config/balance.ts). */
const JAR_HEIGHT = 800;

interface SaveData {
  coins: number;
  upgrades: Record<string, number>;
  album: Record<string, { forms: number[]; golden: number[] }>;
  achievements: string[];
  stats: { merges: number; goldenMerges: number };
}

async function saveData(page: Page): Promise<SaveData> {
  const data = await e2eCall<SaveData | null>(page, 'save');
  if (!data) throw new Error('Сохранение не загружено');
  return data;
}

async function startRun(page: Page, patch: Record<string, unknown>, touch = false): Promise<void> {
  await openGame(page, { lang: 'ru', seed: '5' });
  await patchSave(page, patch);
  await press(page, 'menu.play', touch);
  await waitScene(page, 'Game');
  await waitCanDrop(page);
}

// Тесты ждут настоящую физику и показы, а без видеокарты игровое время идёт медленнее.
test.slow();

test.describe('мета в забеге', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });

  test('новая форма: показ держит физику, форма и достижение сохраняются сразу', async ({
    page,
  }) => {
    const problems = watchConsole(page);
    await startRun(page, { tutorial: { done: true, squish: true } });
    // Две Точки внахлёст: слияние в Запятульку, которой ещё нет в альбоме.
    await e2eCall(page, 'placeKey', 1, 200, JAR_HEIGHT - 25);
    await e2eCall(page, 'placeKey', 1, 248, JAR_HEIGHT - 25);
    await e2eCall(page, 'placeKey', 4, 450, 300);
    const during = await waitRun(page, (state) => state.reveal === 'form');
    expect(during.canDrop).toBe(false);
    const save = await saveData(page);
    expect(save.album.classic?.forms).toEqual([2]);
    expect(save.achievements).toContain('first_clack');
    expect(save.coins).toBe(50);
    // Пока идёт показ, падающая Циферка висит на месте.
    const falling = during.keys.find((key) => key.tier === 4)!;
    await page.waitForTimeout(300);
    const still = await runState(page);
    if (still.reveal === 'form') {
      expect(still.keys.find((key) => key.tier === 4)!.y).toBe(falling.y);
    }
    const after = await waitRun(page, (state) => state.reveal === null && state.canDrop);
    expect(after.keys.find((key) => key.tier === 4)!.y).toBeGreaterThan(falling.y);
    expect(problems).toEqual([]);
  });

  test('монеты забега летят в счётчик и попадают в кошелёк в конце', async ({ page }) => {
    await startRun(page, { ...VETERAN_SAVE, coins: 7 });
    await e2eCall(page, 'placeKey', 3, 200, JAR_HEIGHT - 40, true);
    await e2eCall(page, 'placeKey', 3, 272, JAR_HEIGHT - 40);
    // Слияние с золотой: 4 монеты ×3.
    const state = await waitRun(page, (s) => s.coins === 12 && s.shownCoins === 12);
    expect(state.keys.map((key) => [key.tier, key.golden])).toEqual([[4, true]]);
    await e2eCall(page, 'endRun');
    await waitScene(page, 'Result', 60_000);
    const save = await saveData(page);
    // Очки 40 → бонус 0; в кошельке прежние 7 и 12 за забег.
    expect(save.coins).toBe(7 + 12);
    expect(save.stats.goldenMerges).toBe(1);
  });

  test('золотая форма открывается отдельно и показывается плашкой', async ({ page }) => {
    await startRun(page, {
      ...VETERAN_SAVE,
      album: { classic: { forms: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], golden: [] } },
    });
    await e2eCall(page, 'placeKey', 2, 200, JAR_HEIGHT - 30, true);
    await e2eCall(page, 'placeKey', 2, 258, JAR_HEIGHT - 30);
    const state = await waitRun(page, (s) => s.toasts > 0);
    expect(state.reveal).toBeNull();
    expect((await saveData(page)).album.classic?.golden).toEqual([3]);
  });

  test('«Встряска» и «Удаление»: заряды тратятся, клавиша исчезает', async ({ page }) => {
    const problems = watchConsole(page);
    await startRun(
      page,
      {
        ...VETERAN_SAVE,
        upgrades: { shake: 1, remove: 2, preview: 0, squish: 0, golden: 0, jar: 0 },
      },
      true,
    );
    await e2eCall(page, 'placeKey', 5, 150, JAR_HEIGHT - 50);
    await e2eCall(page, 'placeKey', 3, 450, JAR_HEIGHT - 40);
    await e2eCall(page, 'step', 60);
    await expectButtonsFit(page);
    const before = await runState(page);
    expect(before.charges).toEqual({ shakes: 1, removes: 2 });

    await press(page, 'game.shake', true);
    await waitRun(page, (s) => s.charges.shakes === 0);
    // Клавиши подпрыгнули.
    await waitRun(page, (s) => s.keys.some((key, i) => key.y < before.keys[i]!.y - 2), 5_000);
    // Зарядов нет: кнопка предлагает «+1 Встряска» за рекламу (раз за забег). Отказываемся.
    await press(page, 'game.shake', true);
    await waitScene(page, 'Offer');
    await press(page, 'offer.decline', true);
    await waitScene(page, 'Game');
    expect((await runState(page)).charges.shakes).toBe(0);

    await e2eCall(page, 'step', 120);
    await press(page, 'game.remove', true);
    await waitRun(page, (s) => s.removeMode);
    const target = (await runState(page)).keys.find((key) => key.tier === 3)!;
    await tapJar(page, target.x, target.y, true);
    const removed = await waitRun(page, (s) => !s.removeMode && s.keys.length === 1);
    expect(removed.charges.removes).toBe(1);
    expect(removed.keys[0]!.tier).toBe(5);

    // Тап мимо клавиш отменяет режим и ничего не сбрасывает.
    await press(page, 'game.remove', true);
    await waitRun(page, (s) => s.removeMode);
    await tapJar(page, 450, 300, true);
    const cancelled = await waitRun(page, (s) => !s.removeMode);
    expect(cancelled.keys).toHaveLength(1);
    expect(cancelled.charges.removes).toBe(1);
    expect(problems).toEqual([]);
  });

  test('обучение: первые клавиши по сценарию, рука до первого слияния, потом «тап-тап»', async ({
    page,
  }) => {
    const problems = watchConsole(page);
    // Новый игрок: сохранение по умолчанию, обучение не пройдено.
    await openGame(page, { lang: 'ru', seed: '5' });
    await press(page, 'menu.play', true);
    await waitScene(page, 'Game');
    const start = await waitRun(page, (s) => s.hint === 'drag');
    expect(start.current).toBe(1);
    expect(start.upcoming).toEqual([1]);

    // Игрок нажал — рука прячется; две Точки в одну точку дают первое слияние.
    await tapJar(page, 300, -60, true);
    const second = await waitRun(page, (s) => s.keys.length === 1 && s.hint === 'drag');
    expect(second.current).toBe(1);
    expect(second.upcoming).toEqual([2]);
    await tapJar(page, 300, -60, true);
    await page.waitForFunction(
      () =>
        (window as unknown as { __e2e: { save(): { tutorial: { done: boolean } } } }).__e2e.save()
          .tutorial.done,
      undefined,
      { timeout: 30_000 },
    );
    const merged = await waitRun(page, (s) => s.reveal === null && s.canDrop);
    expect(merged.hint).toBeNull();
    expect(merged.current).toBe(2);

    // Через 30 с игры рука показывает «тап-тап» по клавише, пока игрок сам не тапнет.
    await e2eCall(page, 'step', 1900);
    await waitRun(page, (s) => s.hint === 'tap');
    const key = (await runState(page)).keys[0]!;
    await tapJar(page, key.x, key.y, true);
    await page.waitForFunction(
      () =>
        (window as unknown as { __e2e: { save(): { tutorial: { squish: boolean } } } }).__e2e.save()
          .tutorial.squish,
      undefined,
      { timeout: 30_000 },
    );
    expect(problems).toEqual([]);
  });

  test('легендарная форма: тап пропускает показ', async ({ page }) => {
    await startRun(page, {
      ...VETERAN_SAVE,
      album: { classic: { forms: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], golden: [] } },
    });
    await e2eCall(page, 'placeKey', 10, 200, JAR_HEIGHT - 65);
    await e2eCall(page, 'placeKey', 10, 388, JAR_HEIGHT - 65);
    const start = await waitRun(page, (s) => s.reveal === 'legendary');
    expect((await saveData(page)).album.classic?.forms).toContain(11);
    // Тап в первые полсекунды не пропускает показ: защита от случайного нажатия.
    if (start.revealMs < 300) {
      await page.mouse.click(195, 420);
      const early = await runState(page);
      if (early.revealMs < 450) expect(early.reveal).toBe('legendary');
    }
    // Позже тап закрывает показ задолго до конца его трёх секунд.
    await waitRun(page, (s) => s.revealMs >= 700);
    await page.mouse.click(195, 420);
    let last = 0;
    await waitRun(
      page,
      (s) => {
        if (s.reveal) last = s.revealMs;
        return s.reveal === null;
      },
      20_000,
    );
    expect(last).toBeLessThan(2500);
  });

  test('апгрейды: покупка списывает монеты, поднимает уровень и переживает перезагрузку', async ({
    page,
  }) => {
    const problems = watchConsole(page);
    await openGame(page, { lang: 'ru', seed: '5' });
    await patchSave(page, { ...VETERAN_SAVE, coins: 2000 });
    await press(page, 'menu.upgrades', true);
    await waitScene(page, 'Upgrades');
    await expectButtonsFit(page);
    expect((await getButton(page, 'upgrades.buy.shake')).label).toBe('450');
    await press(page, 'upgrades.buy.shake', true);
    await page.waitForFunction(
      () =>
        (window as unknown as { __e2e: { save(): { upgrades: { shake: number } } } }).__e2e.save()
          .upgrades.shake === 1,
    );
    expect((await saveData(page)).coins).toBe(1550);
    // Цена следующего уровня выросла в 1,6 раза.
    expect((await getButton(page, 'upgrades.buy.shake')).label).toBe('720');

    // «+1 к предпросмотру» — один уровень: после покупки кнопка показывает «МАКС».
    await press(page, 'upgrades.buy.preview', true);
    await page.waitForFunction(
      () =>
        (window as unknown as { __e2e: { save(): { upgrades: { preview: number } } } }).__e2e.save()
          .upgrades.preview === 1,
    );
    expect((await saveData(page)).coins).toBe(350);
    await page.reload();
    await waitScene(page, 'Menu');
    await press(page, 'menu.upgrades', true);
    await waitScene(page, 'Upgrades');
    const buttons = await e2eCall<{ id: string; label: string }[]>(page, 'buttons');
    // Кнопка на максимуме выключена и в списке нажимаемых её нет; купленный уровень на месте.
    expect(buttons.find((b) => b.id === 'upgrades.buy.preview')?.label ?? 'МАКС').toBe('МАКС');
    expect((await saveData(page)).upgrades).toMatchObject({ shake: 1, preview: 1 });
    expect(problems).toEqual([]);
  });

  test('альбом: вкладки миров и медалей, клавиши мира рисуются при открытии вкладки', async ({
    page,
  }) => {
    interface AlbumState {
      tab: string;
      tabs: { id: string; badge: string; latched: boolean }[];
      drawnWorlds: string[];
      cells: number;
    }
    const album = async (): Promise<AlbumState> =>
      (await e2eCall<AlbumState | null>(page, 'album'))!;
    const problems = watchConsole(page);
    await openGame(page, { lang: 'ru', seed: '5' });
    await patchSave(page, {
      album: { classic: { forms: [1, 2, 3, 4, 5, 6, 7], golden: [2] } },
      achievements: ['first_clack', 'caps'],
    });
    await press(page, 'menu.album', true);
    await waitScene(page, 'Album');
    await expectButtonsFit(page);
    const first = await album();
    // Открыт мир из меню; на вкладках — процент мира (8 из 22) и число медалей.
    expect(first.tab).toBe('classic');
    expect(first.tabs).toEqual([
      { id: 'classic', badge: '36%', latched: true },
      { id: 'candy', badge: '0%', latched: false },
      { id: 'space', badge: '0%', latched: false },
      { id: 'medals', badge: '2/11', latched: false },
    ]);
    expect(first.cells).toBe(22);
    // Клавиши других миров ещё не рисовались.
    expect(first.drawnWorlds).toEqual(['classic']);
    await page.mouse.move(195, 420);
    await page.mouse.wheel(0, 2000);
    await page.waitForTimeout(300);

    await press(page, 'album.tab.space', true);
    await expect.poll(async () => (await album()).tab).toBe('space');
    expect((await album()).drawnWorlds).toEqual(['classic', 'space']);
    await expectButtonsFit(page);
    await press(page, 'album.tab.medals', true);
    await expect.poll(async () => (await album()).tab).toBe('medals');
    expect((await album()).cells).toBe(0);
    // Стрелки листают вкладки по кругу.
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await album()).tab).toBe('classic');
    await page.keyboard.press('ArrowLeft');
    await expect.poll(async () => (await album()).tab).toBe('medals');
    await press(page, 'common.back', true);
    await waitScene(page, 'Menu');
    expect(problems).toEqual([]);
  });
});

test.describe('меню и пасхалки', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

  interface MenuState {
    coins: string;
    mascots: number;
    asleep: boolean;
    logoFirstRow: number;
  }

  async function menuState(page: Page): Promise<MenuState> {
    const state = await e2eCall<MenuState | null>(page, 'menu');
    if (!state) throw new Error('Меню не открыто');
    return state;
  }

  test('мелодия на буквах логотипа слева направо — достижение «Пианист»', async ({ page }) => {
    const problems = watchConsole(page);
    await openGame(page, { lang: 'ru', seed: '5' });
    const { logoFirstRow, mascots } = await menuState(page);
    expect(logoFirstRow).toBe(6);
    expect(mascots).toBeGreaterThan(0);
    // Сбились — начинаем сначала: достижение только за мелодию целиком.
    await e2eCall(page, 'pressLogo', 0, 0);
    await e2eCall(page, 'pressLogo', 0, 2);
    expect((await saveData(page)).achievements).not.toContain('pianist');
    for (let index = 0; index < logoFirstRow; index += 1) {
      await e2eCall(page, 'pressLogo', 0, index);
    }
    const save = await saveData(page);
    expect(save.achievements).toContain('pianist');
    expect(save.coins).toBe(100);
    await page.waitForFunction(
      () =>
        (window as unknown as { __e2e: { menu(): { coins: string } } }).__e2e.menu().coins ===
        '100',
    );
    expect(problems).toEqual([]);
  });

  test('тайное слово на клавиатуре — дождь из клавиш и достижение', async ({ page }) => {
    const problems = watchConsole(page);
    await openGame(page, { lang: 'en', seed: '5' });
    for (const code of ['KeyC', 'KeyL', 'KeyA', 'KeyC', 'KeyK']) await page.keyboard.press(code);
    await page.waitForFunction(() =>
      (window as unknown as { __e2e: { save(): { achievements: string[] } } }).__e2e
        .save()
        .achievements.includes('secret_word'),
    );
    // «КЛАЦ» на русской раскладке — те же физические клавиши R, K, F, W: пасхалка снова играет.
    for (const code of ['KeyR', 'KeyK', 'KeyF', 'KeyW']) await page.keyboard.press(code);
    expect(await e2eCall(page, 'scene')).toBe('Menu');
    expect((await saveData(page)).coins).toBe(50);
    expect(problems).toEqual([]);
  });

  test('без касаний персонажи засыпают, касание их будит', async ({ page }) => {
    await openGame(page, { lang: 'ru', seed: '5' });
    expect((await menuState(page)).asleep).toBe(false);
    await e2eCall(page, 'idle', 30_000);
    await page.waitForFunction(
      () => (window as unknown as { __e2e: { menu(): { asleep: boolean } } }).__e2e.menu().asleep,
    );
    await page.mouse.click(40, 800);
    await page.waitForFunction(
      () => !(window as unknown as { __e2e: { menu(): { asleep: boolean } } }).__e2e.menu().asleep,
    );
  });
});
