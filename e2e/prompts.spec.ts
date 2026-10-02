import { expect, test, type Page } from '@playwright/test';
import {
  VETERAN_SAVE,
  e2eCall,
  e2eState,
  expectButtonsFit,
  getButtons,
  openGame,
  patchSave,
  press,
  sdkNames,
  useFakeSdk,
  waitScene,
  watchConsole,
} from './helpers';

interface SaveState {
  prompts: { review: boolean; shortcut: boolean };
}

/** Доиграть забег со счётом больше нуля (две Стрелочки сольются в Таб). */
async function playRun(page: Page): Promise<void> {
  await press(page, 'menu.play');
  await waitScene(page, 'Game');
  await e2eCall(page, 'placeKey', 5, 250, 740);
  await e2eCall(page, 'placeKey', 5, 340, 740);
  await expect
    .poll(async () => (await e2eState<{ score: number } | null>(page, 'run'))?.score ?? 0)
    .toBeGreaterThan(0);
  await e2eCall(page, 'endRun');
  await waitScene(page, 'Result', 60_000);
}

async function menuButtonIds(page: Page): Promise<string[]> {
  return (await getButtons(page)).map((button) => button.id);
}

test.describe('ярлык и отзыв (поддельный SDK)', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async ({ page }) => {
    await useFakeSdk(page);
  });

  test('кнопка «На рабочий стол» — после пятого забега, по нажатию площадка предлагает ярлык', async ({
    page,
  }) => {
    const problems = watchConsole(page);
    await openGame(page);
    expect(await menuButtonIds(page)).not.toContain('menu.shortcut');
    await patchSave(page, { ...VETERAN_SAVE, stats: { bestScore: 100, runs: 5 } });
    await page.reload();
    await waitScene(page, 'Menu');
    await expect.poll(() => menuButtonIds(page)).toContain('menu.shortcut');
    await expectButtonsFit(page);
    await press(page, 'menu.shortcut');
    await expect.poll(() => sdkNames(page, 'shortcut.showPrompt')).toHaveLength(1);
    await expect.poll(() => menuButtonIds(page)).not.toContain('menu.shortcut');
    expect((await e2eState<SaveState>(page, 'save')).prompts.shortcut).toBe(true);
    // Ярлык добавлен: кнопки больше нет и после перезагрузки.
    await page.reload();
    await waitScene(page, 'Menu');
    await page.waitForTimeout(500);
    expect(await menuButtonIds(page)).not.toContain('menu.shortcut');
    expect(problems).toEqual([]);
  });

  test('площадка не разрешает ярлык — кнопки нет', async ({ page }) => {
    await openGame(page, { sdkshortcut: '0' });
    await patchSave(page, { ...VETERAN_SAVE, stats: { bestScore: 100, runs: 9 } });
    await page.reload();
    await waitScene(page, 'Menu');
    await expect.poll(() => sdkNames(page, 'shortcut.canShowPrompt')).toHaveLength(1);
    await page.waitForTimeout(300);
    expect(await menuButtonIds(page)).not.toContain('menu.shortcut');
  });

  test('оценка: новый рекорд в третьем забеге — просим один раз', async ({ page }) => {
    await openGame(page);
    await patchSave(page, { ...VETERAN_SAVE, stats: { bestScore: 0, runs: 2 } });
    await playRun(page);
    await expect
      .poll(() => sdkNames(page, 'feedback.requestReview'), { timeout: 30_000 })
      .toEqual(['feedback.requestReview']);
    await expect
      .poll(async () => (await e2eState<SaveState>(page, 'save')).prompts.review)
      .toBe(true);
    // Ещё один рекорд: больше не просим.
    await press(page, 'result.menu');
    await waitScene(page, 'Menu');
    await patchSave(page, { stats: { bestScore: 0, runs: 4 } });
    await playRun(page);
    await page.waitForTimeout(3000);
    expect(await sdkNames(page, 'feedback')).toEqual([
      'feedback.canReview',
      'feedback.requestReview',
    ]);
  });

  test('оценка: в первых забегах без особых форм не просим', async ({ page }) => {
    await openGame(page);
    await patchSave(page, { ...VETERAN_SAVE, stats: { bestScore: 0, runs: 0 } });
    await playRun(page);
    await page.waitForTimeout(3000);
    expect(await sdkNames(page, 'feedback')).toEqual([]);
  });

  test('оценка: без входа площадка не разрешает — попросим в другой раз', async ({ page }) => {
    await openGame(page, { sdkreview: 'NO_AUTH' });
    await patchSave(page, { ...VETERAN_SAVE, stats: { bestScore: 0, runs: 5 } });
    await playRun(page);
    await expect
      .poll(() => sdkNames(page, 'feedback'), { timeout: 30_000 })
      .toEqual(['feedback.canReview']);
    await page.waitForTimeout(500);
    expect((await e2eState<SaveState>(page, 'save')).prompts.review).toBe(false);
  });
});
