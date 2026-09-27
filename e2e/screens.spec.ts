import { expect, test } from '@playwright/test';
import {
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

for (const size of SIZES) {
  const name = `${size.width}x${size.height}`;

  test.describe(name, () => {
    test.use({
      viewport: { width: size.width, height: size.height },
      deviceScaleFactor: size.mobile ? 2 : 1,
      isMobile: size.mobile,
      hasTouch: size.mobile,
    });

    test('экраны помещаются целиком, скриншоты', async ({ page }) => {
      const problems = watchConsole(page);

      for (const lang of ['ru', 'en']) {
        await openGame(page, { lang });
        await expectNoPageScroll(page);
        await expectButtonsFit(page);
        if (lang === 'ru' || size.allScreens) await screenshot(page, `menu-${lang}-${name}`);
      }

      await openGame(page, { lang: 'ru' });
      await press(page, 'menu.play', size.mobile);
      await waitScene(page, 'Game');
      await expectNoPageScroll(page);
      await expectButtonsFit(page);
      if (size.allScreens) await screenshot(page, `game-ru-${name}`);

      await press(page, 'game.pause', size.mobile);
      await waitScene(page, 'Pause');
      await expectButtonsFit(page);
      if (size.allScreens) await screenshot(page, `pause-ru-${name}`);

      expect(problems).toEqual([]);
    });
  });
}
