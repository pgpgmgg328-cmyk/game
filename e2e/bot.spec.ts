import { expect, test } from '@playwright/test';
import { VETERAN_SAVE, openGame, patchSave, runState, waitScene, watchConsole } from './helpers';

test.use({ viewport: { width: 390, height: 844 } });

test('?bot=1: бот сам начинает забег и бросает клавиши', async ({ page }) => {
  const problems = watchConsole(page);
  await openGame(page, { lang: 'ru' });
  await patchSave(page, VETERAN_SAVE);
  await page.goto('/?e2e=1&lang=ru&bot=1');
  await waitScene(page, 'Game', 30_000);
  await expect
    .poll(async () => (await runState(page)).keys.length, { timeout: 30_000 })
    .toBeGreaterThan(2);
  expect(problems).toEqual([]);
});

test('без ?bot бот не играет', async ({ page }) => {
  await openGame(page, { lang: 'ru' });
  await page.waitForTimeout(2500);
  expect(await page.evaluate(() => document.body.dataset.scene)).toBe('Menu');
});
