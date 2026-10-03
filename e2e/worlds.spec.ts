import { expect, test, type Page } from '@playwright/test';
import {
  VETERAN_SAVE,
  e2eCall,
  e2eState,
  expectButtonsFit,
  getButton,
  getButtons,
  openGame,
  patchSave,
  press,
  runState,
  waitCanDrop,
  waitRun,
  waitScene,
  watchConsole,
} from './helpers';

/** Высота банки в единицах физики (config/balance.ts). */
const JAR_HEIGHT = 800;

interface MenuState {
  world: string;
  locked: boolean;
}

interface SaveState {
  coins: number;
  worlds: { selected: string; bought: string[] };
  album: Record<string, { forms: number[]; golden: number[] }>;
}

const menuState = (page: Page): Promise<MenuState> => e2eState<MenuState>(page, 'menu');
const saveState = (page: Page): Promise<SaveState> => e2eState<SaveState>(page, 'save');

async function buttonIds(page: Page): Promise<string[]> {
  return (await getButtons(page)).map((button) => button.id);
}

// Тесты ждут настоящую физику, а без видеокарты игровое время идёт медленнее.
test.slow();
test.use({ viewport: { width: 390, height: 844 } });

test.describe('миры (диздок, раздел 5)', () => {
  test('карусель в меню: стрелки листают миры, закрытый мир — «ОТКРЫТЬ» ведёт на экран миров', async ({
    page,
  }) => {
    const problems = watchConsole(page);
    await openGame(page, { lang: 'ru' });
    expect(await menuState(page)).toMatchObject({ world: 'classic', locked: false });
    expect((await getButton(page, 'menu.world')).label).toBe('Клац-Классика');
    await press(page, 'menu.nextWorld');
    await expect.poll(async () => (await menuState(page)).world).toBe('candy');
    expect((await menuState(page)).locked).toBe(true);
    expect((await getButton(page, 'menu.play')).label).toBe('ОТКРЫТЬ');
    expect((await saveState(page)).worlds.selected).toBe('candy');
    await expectButtonsFit(page);
    // Стрелка с клавиатуры тоже листает, по кругу.
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect.poll(async () => (await menuState(page)).world).toBe('space');
    await press(page, 'menu.play');
    await waitScene(page, 'Worlds');
    await expectButtonsFit(page);
    const worlds = await e2eState<{ id: string; unlocked: boolean }[]>(page, 'worlds');
    expect(worlds.map((world) => [world.id, world.unlocked])).toEqual([
      ['classic', true],
      ['candy', false],
      ['space', false],
    ]);
    // Монет нет — открыть за монеты нельзя, а попробовать за рекламу можно.
    expect((await getButton(page, 'worlds.buy.candy')).disabled).toBe(true);
    expect((await getButton(page, 'worlds.try.candy')).disabled).toBe(false);
    expect(problems).toEqual([]);
  });

  test('открыть мир за монеты: монеты списаны, мир выбран, «Играть» начинает забег в нём', async ({
    page,
  }) => {
    const problems = watchConsole(page);
    await openGame(page, { lang: 'ru' });
    await patchSave(page, { ...VETERAN_SAVE, album: {}, coins: 3500 });
    await press(page, 'menu.world');
    await waitScene(page, 'Worlds');
    await press(page, 'worlds.buy.candy');
    await expect.poll(async () => (await saveState(page)).coins).toBe(500);
    expect((await saveState(page)).worlds).toEqual({ selected: 'candy', bought: ['candy'] });
    await expect.poll(() => buttonIds(page)).toContain('worlds.play.candy');
    // Покупка переживает перезагрузку.
    await page.reload();
    await waitScene(page, 'Menu');
    expect(await menuState(page)).toMatchObject({ world: 'candy', locked: false });
    await press(page, 'menu.play');
    await waitScene(page, 'Game');
    expect((await runState(page)).world).toBe('candy');
    expect(problems).toEqual([]);
  });

  test('попробовать мир за рекламу: один пробный забег, «Ещё раз» — снова за рекламу', async ({
    page,
  }) => {
    const problems = watchConsole(page);
    await openGame(page, { lang: 'ru' });
    await patchSave(page, { ...VETERAN_SAVE, worlds: { selected: 'space', bought: [] } });
    await page.reload();
    await waitScene(page, 'Menu');
    // «ОТКРЫТЬ» у закрытого мира открывает экран миров на его карточке.
    await press(page, 'menu.play');
    await waitScene(page, 'Worlds');
    await press(page, 'worlds.try.space');
    // Реклама-заглушка идёт секунду, награда — только после неё.
    await waitScene(page, 'Game', 30_000);
    const state = await runState(page);
    expect(state).toMatchObject({ world: 'space', trial: true });
    // Мир так и остался закрытым.
    expect((await saveState(page)).worlds.bought).toEqual([]);
    await waitCanDrop(page);
    await e2eCall(page, 'endRun');
    await waitScene(page, 'Result', 60_000);
    const ids = await buttonIds(page);
    expect(ids).toContain('result.trialAgain');
    expect(ids).not.toContain('result.again');
    await press(page, 'result.trialAgain');
    await waitScene(page, 'Game', 30_000);
    expect(await runState(page)).toMatchObject({ world: 'space', trial: true });
    expect(problems).toEqual([]);
  });

  test('первая «Карамелька» и первый «Метеорчик»: подсказка до броска, потом больше не нужна', async ({
    page,
  }) => {
    const problems = watchConsole(page);
    interface TutorialSave {
      tutorial: { caramel: boolean; meteor: boolean };
    }
    const tutorial = async () => (await e2eState<TutorialSave>(page, 'save')).tutorial;
    await openGame(page, { lang: 'ru', seed: '5' });
    await patchSave(page, {
      ...VETERAN_SAVE,
      tutorial: { done: true, squish: true, caramel: false, meteor: false },
      worlds: { selected: 'candy', bought: ['candy', 'space'] },
    });
    await press(page, 'menu.play');
    await waitScene(page, 'Game');
    await waitCanDrop(page);
    expect((await runState(page)).specialHint).toBeNull();
    await e2eCall(page, 'setSpecial', 'caramel', 2);
    expect(await runState(page)).toMatchObject({ special: 'caramel', specialHint: 'caramel' });
    await page.keyboard.press('Space');
    await waitRun(page, (s) => s.specialHint === null && s.special === null);
    await expect.poll(tutorial).toMatchObject({ caramel: true, meteor: false });
    // Вторая «Карамелька» — без подсказки.
    await waitCanDrop(page);
    await e2eCall(page, 'setSpecial', 'caramel', 2);
    expect(await runState(page)).toMatchObject({ special: 'caramel', specialHint: null });

    // «Метеорчик» — в космическом мире.
    await e2eCall(page, 'endRun');
    await waitScene(page, 'Result', 60_000);
    await press(page, 'result.menu');
    await waitScene(page, 'Menu', 30_000);
    await press(page, 'menu.nextWorld');
    await expect.poll(() => menuState(page)).toMatchObject({ world: 'space', locked: false });
    await press(page, 'menu.play');
    await waitScene(page, 'Game');
    await waitCanDrop(page);
    await e2eCall(page, 'setSpecial', 'meteor');
    expect(await runState(page)).toMatchObject({ special: 'meteor', specialHint: 'meteor' });
    await page.keyboard.press('Space');
    await waitRun(page, (s) => s.specialHint === null);
    await expect.poll(tutorial).toMatchObject({ caramel: true, meteor: true });
    expect(problems).toEqual([]);
  });

  test('Пробел открывает следующий мир: плашка в забеге и строка на экране результата', async ({
    page,
  }) => {
    const problems = watchConsole(page);
    await openGame(page, { lang: 'ru', seed: '5' });
    await patchSave(page, {
      ...VETERAN_SAVE,
      album: { classic: { forms: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], golden: [] } },
    });
    await press(page, 'menu.play');
    await waitScene(page, 'Game');
    await waitCanDrop(page);
    await e2eCall(page, 'placeKey', 10, 200, JAR_HEIGHT - 65);
    await e2eCall(page, 'placeKey', 10, 388, JAR_HEIGHT - 65);
    await waitRun(page, (s) => s.reveal === 'legendary');
    await expect.poll(async () => (await saveState(page)).album.classic?.forms ?? []).toContain(11);
    await e2eCall(page, 'endRun');
    await waitScene(page, 'Result', 60_000);
    await press(page, 'result.menu');
    await waitScene(page, 'Menu', 30_000);
    await press(page, 'menu.nextWorld');
    await expect.poll(() => menuState(page)).toMatchObject({ world: 'candy', locked: false });
    expect((await getButton(page, 'menu.play')).label).toBe('ИГРАТЬ');
    expect(problems).toEqual([]);
  });
});
