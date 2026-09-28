import { expect, test } from '@playwright/test';
import {
  e2eCall,
  expectButtonsFit,
  expectNoPageScroll,
  openGame,
  press,
  screenshot,
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

/** Клавиши всех 11 форм: банка на скриншоте выглядит как посреди забега. */
const JAR_SAMPLE: [tier: number, x: number, y: number][] = [
  [9, 120, 720],
  [10, 420, 720],
  [7, 90, 590],
  [8, 300, 600],
  [6, 500, 590],
  [5, 60, 470],
  [4, 200, 480],
  [3, 330, 470],
  [2, 450, 470],
  [1, 540, 470],
  [11, 300, 340],
];

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

    test('забег, пауза и результат помещаются целиком, скриншоты', async ({ page }) => {
      // Без видеокарты WebGL рисует процессор: на 768×1024 при DPR 2 (холст 1536×2048) кадров
      // всего несколько в секунду, а в параллельном прогоне ещё меньше. Тесту нужно больше времени.
      test.setTimeout(150_000);
      const problems = watchConsole(page);
      await openGame(page, { lang: 'ru', seed: '7' });
      await press(page, 'menu.play', size.mobile);
      await waitScene(page, 'Game');
      for (const [tier, x, y] of JAR_SAMPLE) await e2eCall(page, 'placeKey', tier, x, y);
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
  });
}
