import { expect, test, type Page } from '@playwright/test';
import {
  e2eCall,
  expectButtonsFit,
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
    // Зарядов нет: кнопка на месте, но нажатие ничего не делает.
    await press(page, 'game.shake', true);
    await page.waitForTimeout(200);
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
});
