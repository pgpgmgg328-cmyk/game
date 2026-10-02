import { expect, test, type Page } from '@playwright/test';
import {
  VETERAN_SAVE,
  e2eCall,
  e2eState,
  expectButtonsFit,
  expectNoPageScroll,
  openGame,
  patchSave,
  press,
  sdkNames,
  useFakeSdk,
  waitScene,
  watchConsole,
} from './helpers';

interface BoardState {
  status: string | null;
  best: string;
  rows: { rank: number; score: number; self: boolean }[];
  signIn: boolean;
}

async function openBoard(page: Page): Promise<BoardState> {
  await press(page, 'menu.leaderboard');
  await waitScene(page, 'Leaderboard');
  return waitBoard(page, (board) => board.status === null || !board.status.includes('…'));
}

async function waitBoard(page: Page, check: (board: BoardState) => boolean): Promise<BoardState> {
  let state: BoardState | null = null;
  await expect
    .poll(async () => {
      state = await e2eState<BoardState | null>(page, 'leaderboard');
      return state !== null && check(state);
    })
    .toBe(true);
  return state!;
}

test.describe('рекорды и вход (поддельный SDK)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await useFakeSdk(page);
  });

  test('гость видит топ-10 без имён и кнопку входа с объяснением', async ({ page }) => {
    const problems = watchConsole(page);
    await openGame(page);
    await patchSave(page, { ...VETERAN_SAVE, stats: { bestScore: 6000, runs: 3 } });
    const board = await openBoard(page);
    expect(board.best).toBe('Твой рекорд: 6 000');
    expect(board.rows.map((row) => row.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(board.rows[0]).toEqual({ rank: 1, score: 41000, self: false });
    expect(board.rows.some((row) => row.self)).toBe(false);
    expect(board.signIn).toBe(true);
    await expectButtonsFit(page);
    expect(problems).toEqual([]);
  });

  test('вход: прогресс гостя переходит в аккаунт, рекорд попадает в таблицу', async ({ page }) => {
    const problems = watchConsole(page);
    await openGame(page);
    await patchSave(page, { ...VETERAN_SAVE, coins: 777, stats: { bestScore: 6000, runs: 3 } });
    await openBoard(page);
    await press(page, 'leaderboard.signIn');
    const board = await waitBoard(page, (state) => state.rows.some((row) => row.self));
    expect(await e2eState(page, 'authorized')).toBe(true);
    expect(board.signIn).toBe(false);
    expect(board.rows.find((row) => row.self)).toMatchObject({ score: 6000, rank: 9 });
    expect(await sdkNames(page, 'leaderboards.setScore')).toEqual([
      'leaderboards.setScore:bestScore:6000',
    ]);
    expect(await e2eState(page, 'save')).toMatchObject({ coins: 777 });
    expect(problems).toEqual([]);
  });

  test('у аккаунта свой прогресс: после окна выбора игра берёт его и выходит в меню', async ({
    page,
  }) => {
    await openGame(page);
    await patchSave(page, { ...VETERAN_SAVE, coins: 10, stats: { bestScore: 100, runs: 1 } });
    // Прогресс аккаунта в «облаке» площадки.
    const account = JSON.parse(
      JSON.stringify(await e2eState<Record<string, unknown>>(page, 'save')),
    ) as Record<string, unknown>;
    account.coins = 4321;
    account.rev = 2;
    await page.evaluate(
      (data) => localStorage.setItem('fake-sdk-cloud-account', JSON.stringify(data)),
      account,
    );
    await e2eCall(page, 'flushSaves');
    await openBoard(page);
    await press(page, 'leaderboard.signIn');
    await waitScene(page, 'Menu', 30_000);
    await expect
      .poll(async () => (await e2eState<{ coins: number }>(page, 'save')).coins)
      .toBe(4321);
    expect(await e2eState(page, 'authorized')).toBe(true);
    // После перезагрузки выбранный прогресс на месте: старый кэш гостя его не перебил.
    await page.reload();
    await waitScene(page, 'Menu');
    expect((await e2eState<{ coins: number }>(page, 'save')).coins).toBe(4321);
  });

  test('окно входа закрыли — всё как было', async ({ page }) => {
    const problems = watchConsole(page);
    await openGame(page, { sdkauthdialog: 'cancel' });
    await openBoard(page);
    await press(page, 'leaderboard.signIn');
    const board = await waitBoard(page, (state) => state.signIn);
    expect(board.rows).toHaveLength(10);
    expect(await e2eState(page, 'authorized')).toBe(false);
    expect(problems).toEqual([]);
  });

  test('новый рекорд вошедшего игрока уходит в таблицу в конце забега', async ({ page }) => {
    await openGame(page, { sdkauth: '1' });
    await patchSave(page, VETERAN_SAVE);
    await press(page, 'menu.play');
    await waitScene(page, 'Game');
    await e2eCall(page, 'placeKey', 5, 250, 740);
    await e2eCall(page, 'placeKey', 5, 340, 740);
    await expect
      .poll(async () => (await e2eState<{ score: number } | null>(page, 'run'))?.score ?? 0)
      .toBeGreaterThan(0);
    const { score } = (await e2eState<{ score: number }>(page, 'run'))!;
    await e2eCall(page, 'endRun');
    await waitScene(page, 'Result', 60_000);
    await expect
      .poll(() => sdkNames(page, 'leaderboards.setScore'))
      .toEqual([`leaderboards.setScore:bestScore:${score}`]);
    const board = await (async () => {
      await press(page, 'result.menu');
      await waitScene(page, 'Menu');
      return openBoard(page);
    })();
    expect(board.signIn).toBe(false);
    expect(board.rows.find((row) => row.self)?.score).toBe(score);
  });
});

test('без Яндекса таблицы нет и вход не предлагается', async ({ page }) => {
  const problems = watchConsole(page);
  await openGame(page, { lang: 'ru' });
  const board = await openBoard(page);
  expect(board.status).toBe('Таблица рекордов пока недоступна');
  expect(board.signIn).toBe(false);
  await expectNoPageScroll(page);
  await expectButtonsFit(page);
  expect(problems).toEqual([]);
});
