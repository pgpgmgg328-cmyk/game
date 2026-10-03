import { expect, test, type Page } from '@playwright/test';
import {
  VETERAN_SAVE,
  e2eCall,
  e2eState,
  expectButtonsFit,
  openGame,
  patchSave,
  press,
  useFakeSdk,
  waitCanDrop,
  waitScene,
  watchConsole,
} from './helpers';

/** Высота банки в единицах физики (config/balance.ts). */
const JAR_HEIGHT = 800;

interface DailyState {
  day: number;
  gift: string | null;
  streak: number;
}

interface SaveState {
  coins: number;
  achievements: string[];
  daily: {
    day: number;
    task: { world: string; tier: number } | null;
    taskDone: boolean;
    gift: boolean;
    adGift: boolean;
    streak: number;
    lastDone: number;
    bestStreak: number;
  };
}

const dailyState = (page: Page): Promise<DailyState> => e2eState<DailyState>(page, 'daily');
const saveState = (page: Page): Promise<SaveState> => e2eState<SaveState>(page, 'save');

// Тесты ждут настоящую физику, а без видеокарты игровое время идёт медленнее.
test.slow();
test.use({ viewport: { width: 390, height: 844 } });

test.describe('ежедневное (диздок, раздел 6)', () => {
  test('подарок дня: бесплатный, второй за рекламу, назавтра — снова', async ({ page }) => {
    const problems = watchConsole(page);
    await useFakeSdk(page);
    await openGame(page);
    await patchSave(page, { ...VETERAN_SAVE, coins: 0 });
    await press(page, 'menu.daily');
    await waitScene(page, 'Daily');
    await expectButtonsFit(page);
    expect((await dailyState(page)).gift).toBe('daily.gift');
    await press(page, 'daily.gift');
    await expect.poll(async () => (await saveState(page)).coins).toBe(150);
    await expect.poll(async () => (await dailyState(page)).gift).toBe('daily.adGift');
    // Второй подарок — только после рекламы за награду.
    await press(page, 'daily.adGift');
    await expect.poll(async () => (await saveState(page)).coins, { timeout: 30_000 }).toBe(300);
    await expect.poll(async () => (await dailyState(page)).gift).toBeNull();
    // Назавтра (по серверному времени) подарки снова ждут.
    const today = (await dailyState(page)).day;
    await page.evaluate(() =>
      (window as unknown as { __fakeSdk: { shiftDays(n: number): void } }).__fakeSdk.shiftDays(1),
    );
    await page.reload();
    await waitScene(page, 'Menu');
    await press(page, 'menu.daily');
    await waitScene(page, 'Daily');
    expect(await dailyState(page)).toMatchObject({ day: today + 1, gift: 'daily.gift' });
    expect(problems).toEqual([]);
  });

  test('«Клавиша дня» в забеге: награда и седьмой день подряд — «Радуга» и «Неделя подряд»', async ({
    page,
  }) => {
    const problems = watchConsole(page);
    await openGame(page, { lang: 'ru', seed: '5' });
    const today = await e2eCall<number>(page, 'today');
    await patchSave(page, {
      ...VETERAN_SAVE,
      coins: 0,
      daily: {
        day: today,
        task: { world: 'classic', tier: 5 },
        taskDone: false,
        gift: true,
        adGift: true,
        streak: 6,
        lastDone: today - 1,
        bestStreak: 6,
      },
    });
    await press(page, 'menu.daily');
    await waitScene(page, 'Daily');
    expect((await dailyState(page)).streak).toBe(6);
    await press(page, 'daily.play');
    await waitScene(page, 'Game');
    await waitCanDrop(page);
    // Две Циферки внахлёст: слияние в Стрелочку — это и есть задание дня.
    await e2eCall(page, 'placeKey', 4, 250, JAR_HEIGHT - 45);
    await e2eCall(page, 'placeKey', 4, 330, JAR_HEIGHT - 45);
    await expect
      .poll(async () => (await saveState(page)).daily.taskDone, { timeout: 30_000 })
      .toBe(true);
    const save = await saveState(page);
    expect(save.daily).toMatchObject({ streak: 7, bestStreak: 7, lastDone: today });
    expect(save.achievements).toContain('week_streak');
    // 150 + 50 × 5 за задание и 300 за «Неделю подряд», плюс монеты за само слияние.
    expect(save.coins).toBeGreaterThanOrEqual(400 + 300);
    expect(problems).toEqual([]);
  });
});
