import { expect, test, type Page } from '@playwright/test';
import {
  e2eCall,
  e2eState,
  expectButtonsFit,
  expectNoPageScroll,
  getButton,
  openGame,
  press,
  runState,
  tapJar,
  waitCanDrop,
  waitScene,
  watchConsole,
} from './helpers';

/** Высота банки и линия опасности в единицах физики (config/balance.ts). */
const JAR_HEIGHT = 800;

async function startRun(page: Page, touch = false, seed = '5'): Promise<void> {
  await openGame(page, { lang: 'ru', seed });
  await press(page, 'menu.play', touch);
  await waitScene(page, 'Game');
  await waitCanDrop(page);
}

/** Сбросить клавишу заданного тира в точку x настоящим вводом. */
async function dropTier(page: Page, tier: number, x: number, touch = false): Promise<void> {
  await waitCanDrop(page);
  await e2eCall(page, 'setCurrent', tier);
  const before = (await runState(page)).keys.length;
  await tapJar(page, x, -60, touch);
  await page.waitForFunction(
    (count) =>
      ((window as unknown as { __e2e: { run(): { keys: unknown[] } } }).__e2e.run()?.keys.length ??
        0) !== count,
    before,
  );
}

/** Башня из чередующихся клавиш выше линии опасности: им не с кем слиться. */
async function buildTower(page: Page): Promise<void> {
  let y = JAR_HEIGHT;
  for (let i = 0; i < 10; i += 1) {
    const tier = i % 2 === 0 ? 5 : 4;
    const height = tier === 5 ? 100 : 85;
    await e2eCall(page, 'placeKey', tier, 450, y - height / 2 - 1);
    y -= height + 2;
  }
}

// Тесты ждут настоящую физику, а без видеокарты кадры и игровое время идут медленнее.
test.slow();

test.describe('забег (мышь, десктоп)', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('две одинаковые клавиши, сброшенные мышью, сливаются, счёт растёт', async ({ page }) => {
    const problems = watchConsole(page);
    await startRun(page);
    await dropTier(page, 1, 300);
    await dropTier(page, 1, 300);
    await page.waitForFunction(
      () =>
        (window as unknown as { __e2e: { run(): { score: number } } }).__e2e.run()?.score === 10,
      undefined,
      { timeout: 15_000 },
    );
    const state = await runState(page);
    expect(state.keys.map((key) => key.tier)).toEqual([2]);
    expect(await e2eState(page, 'gameplayActive')).toBe(true);
    expect(problems).toEqual([]);
  });

  test('клавиатура: стрелки ведут прицел, пробел сбрасывает', async ({ page }) => {
    await startRun(page);
    const start = (await runState(page)).aimX;
    await page.keyboard.down('ArrowLeft');
    await page.waitForFunction(
      (x) =>
        (window as unknown as { __e2e: { run(): { aimX: number } } }).__e2e.run().aimX < x - 40,
      start,
    );
    await page.keyboard.up('ArrowLeft');
    const left = (await runState(page)).aimX;
    await page.keyboard.down('KeyD');
    await page.waitForFunction(
      (x) =>
        (window as unknown as { __e2e: { run(): { aimX: number } } }).__e2e.run().aimX > x + 40,
      left,
    );
    await page.keyboard.up('KeyD');
    await page.keyboard.press('Space');
    await page.waitForFunction(
      () =>
        (window as unknown as { __e2e: { run(): { keys: unknown[] } } }).__e2e.run().keys.length ===
        1,
    );
    // Esc ставит на паузу.
    await page.keyboard.press('Escape');
    await waitScene(page, 'Pause');
    await page.keyboard.press('Escape');
    await waitScene(page, 'Game');
  });

  test('пауза останавливает физику', async ({ page }) => {
    await startRun(page);
    await e2eCall(page, 'placeKey', 3, 300, 100);
    await press(page, 'game.pause');
    await waitScene(page, 'Pause');
    const before = (await runState(page)).keys[0]!.y;
    await page.waitForTimeout(600);
    expect((await runState(page)).keys[0]!.y).toBe(before);
    await press(page, 'pause.continue');
    await waitScene(page, 'Game');
    await page.waitForFunction(
      (y) =>
        (window as unknown as { __e2e: { run(): { keys: { y: number }[] } } }).__e2e.run().keys[0]!
          .y >
        y + 20,
      before,
    );
  });

  test('переполнение: мягкая надпись, экран результата, рекорд сохранён', async ({ page }) => {
    const problems = watchConsole(page);
    await startRun(page);
    await e2eCall(page, 'placeKey', 3, 200, 760);
    await e2eCall(page, 'placeKey', 3, 270, 760);
    await buildTower(page);
    await page.waitForFunction(
      () =>
        (window as unknown as { __e2e: { run(): { ending: boolean } | null } }).__e2e.run()
          ?.ending === true,
      undefined,
      { timeout: 20_000 },
    );
    expect(await e2eState(page, 'gameplayActive')).toBe(false);
    // Башня может ещё качнуться и дать слияние, поэтому рекорд сверяем со счётом в момент конца.
    const { score } = await runState(page);
    expect(score).toBeGreaterThanOrEqual(20);
    await waitScene(page, 'Result', 45_000);
    expect(await e2eCall(page, 'stats')).toEqual({ bestScore: score, runs: 1 });
    // Снимок забега больше не нужен: после перезагрузки «Продолжить?» не спросят.
    expect(await e2eCall(page, 'savedRun')).toBeNull();
    await expectButtonsFit(page);
    await press(page, 'result.again');
    await waitScene(page, 'Game');
    expect((await runState(page)).keys).toEqual([]);
    expect(problems).toEqual([]);
  });

  test('звук включается после первого жеста и выключается, когда вкладка скрыта', async ({
    page,
  }) => {
    await openGame(page, { lang: 'ru' });
    expect(await e2eState(page, 'audio')).toEqual({
      unlocked: false,
      running: false,
      music: false,
    });
    await press(page, 'menu.play');
    await waitScene(page, 'Game');
    await page.waitForFunction(
      () =>
        (window as unknown as { __e2e: { audio(): { running: boolean } } }).__e2e.audio().running,
    );
    expect(await e2eState(page, 'audio')).toMatchObject({ unlocked: true, music: true });
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForFunction(
      () =>
        !(window as unknown as { __e2e: { audio(): { running: boolean } } }).__e2e.audio().running,
    );
    expect(await e2eState(page, 'audio')).toMatchObject({ running: false, music: false });
  });
});

test.describe('забег (палец, телефон)', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });

  test('тап по лежащей клавише — сквиш, а не сброс', async ({ page }) => {
    await startRun(page, true);
    await e2eCall(page, 'placeKey', 5, 300, JAR_HEIGHT - 50);
    await e2eCall(page, 'step', 60);
    const key = (await runState(page)).keys[0]!;
    await tapJar(page, key.x, key.y, true);
    await page.waitForFunction(
      (y) =>
        (window as unknown as { __e2e: { run(): { keys: { y: number }[] } } }).__e2e.run().keys[0]!
          .y <
        y - 5,
      key.y,
    );
    expect((await runState(page)).keys).toHaveLength(1);
  });

  test('сброс пальцем и слияние', async ({ page }) => {
    await startRun(page, true);
    await dropTier(page, 2, 200, true);
    await dropTier(page, 2, 200, true);
    await page.waitForFunction(
      () =>
        (window as unknown as { __e2e: { run(): { score: number } } }).__e2e.run()?.score === 20,
      undefined,
      { timeout: 15_000 },
    );
  });

  test('поворот посреди забега: клавиши на месте, всё помещается', async ({ page }) => {
    const problems = watchConsole(page);
    await startRun(page, true);
    await dropTier(page, 3, 150, true);
    await dropTier(page, 5, 450, true);
    await e2eCall(page, 'freeze', true);
    const before = await runState(page);
    for (const [width, height] of [
      [844, 390],
      [390, 844],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.waitForFunction(
        ([w, h]) => {
          const canvas = document.querySelector('canvas')!.getBoundingClientRect();
          return Math.round(canvas.width) === w && Math.round(canvas.height) === h;
        },
        [width, height],
      );
      await page.waitForTimeout(200);
      expect(await e2eState(page, 'scene')).toBe('Game');
      expect(await runState(page)).toEqual(before);
      await expectNoPageScroll(page);
      await expectButtonsFit(page);
    }
    expect(problems).toEqual([]);
  });

  test('перезагрузка посреди забега: «Продолжить забег?» возвращает клавиши и счёт', async ({
    page,
  }) => {
    const problems = watchConsole(page);
    await startRun(page, true);
    await dropTier(page, 1, 200, true);
    await dropTier(page, 1, 200, true);
    await dropTier(page, 4, 450, true);
    await page.waitForFunction(
      () => (window as unknown as { __e2e: { run(): { score: number } } }).__e2e.run().score === 10,
    );
    // Даём клавишам осесть: иначе восстановленная падающая клавиша успеет сдвинуться до проверки.
    await e2eCall(page, 'step', 240);
    await e2eCall(page, 'freeze', true);
    const before = await runState(page);

    await page.reload();
    await waitScene(page, 'Menu');
    expect((await getButton(page, 'resume.yes')).label).toBe('Да');
    await expectButtonsFit(page);
    await press(page, 'resume.yes', true);
    await waitScene(page, 'Game');
    await e2eCall(page, 'freeze', true);
    const after = await runState(page);
    expect(after.score).toBe(before.score);
    expect(after.current).toBe(before.current);
    expect(after.upcoming).toEqual(before.upcoming);
    expect(after.keys.map((key) => key.tier)).toEqual(before.keys.map((key) => key.tier));
    after.keys.forEach((key, index) => {
      expect(key.x).toBeCloseTo(before.keys[index]!.x, 0);
      expect(key.y).toBeCloseTo(before.keys[index]!.y, 0);
    });

    // «Нет» убирает снимок: после следующей перезагрузки ничего не спрашивают.
    await page.reload();
    await waitScene(page, 'Menu');
    await press(page, 'resume.no', true);
    await page.reload();
    await waitScene(page, 'Menu');
    expect((await e2eCall<{ id: string }[]>(page, 'buttons')).map((b) => b.id)).not.toContain(
      'resume.yes',
    );
    expect(problems).toEqual([]);
  });
});
