import { expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

export interface E2eButton {
  id: string;
  label: string;
  scene: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export const SCREENS_DIR = fileURLToPath(new URL('./__screens__/', import.meta.url));
const FAKE_SDK = fileURLToPath(new URL('./fixtures/fake-sdk.js', import.meta.url));

/**
 * Сообщения самого Chromium, когда в системе нет видеокарты и WebGL рисуется программно.
 * К коду игры они отношения не имеют: игра не вызывает readPixels и не трогает настройки GPU.
 */
const BROWSER_NOISE = [
  /GL Driver Message \(OpenGL, Performance, GL_CLOSE_PATH_NV, High\): GPU stall due to ReadPixels/,
  /Automatic fallback to software WebGL has been deprecated/,
];

/** Собирает ошибки и предупреждения консоли, а также необработанные исключения страницы. */
export function watchConsole(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    const type = message.type();
    if (type !== 'error' && type !== 'warning') return;
    const text = message.text();
    if (BROWSER_NOISE.some((pattern) => pattern.test(text))) return;
    problems.push(`[${type}] ${text}`);
  });
  page.on('pageerror', (error) => problems.push(`[pageerror] ${error.message}`));
  return problems;
}

/** Подменяет /sdk.js поддельным SDK Яндекса, чтобы проверить YandexPlatform в браузере. */
export async function useFakeSdk(page: Page): Promise<void> {
  await page.route('**/sdk.js', (route) =>
    route.fulfill({ path: FAKE_SDK, contentType: 'text/javascript; charset=utf-8' }),
  );
}

export async function waitScene(page: Page, scene: string): Promise<void> {
  await page.waitForFunction((name) => document.body.dataset.scene === name, scene, {
    timeout: 15_000,
  });
  // Два кадра, чтобы экран успел нарисоваться.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

/** Открывает игру и ждёт главное меню. */
export async function openGame(page: Page, params: Record<string, string> = {}): Promise<void> {
  const query = new URLSearchParams({ e2e: '1', ...params });
  await page.goto(`/?${query.toString()}`);
  await waitScene(page, 'Menu');
}

export async function getButtons(page: Page): Promise<E2eButton[]> {
  return page.evaluate(() =>
    (window as unknown as { __e2e: { buttons(): E2eButton[] } }).__e2e.buttons(),
  );
}

export async function getButton(page: Page, id: string): Promise<E2eButton> {
  const button = (await getButtons(page)).find((item) => item.id === id);
  if (!button) throw new Error(`Кнопки «${id}» нет на экране`);
  return button;
}

/** Нажимает кнопку по её id: пальцем на сенсорных устройствах, мышью на остальных. */
export async function press(page: Page, id: string, touch = false): Promise<void> {
  const button = await getButton(page, id);
  const x = button.x + button.width / 2;
  const y = button.y + button.height / 2;
  if (touch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

export async function e2eState<T>(page: Page, key: string): Promise<T> {
  return page.evaluate(
    (name) => (window as unknown as { __e2e: Record<string, () => unknown> }).__e2e[name]!(),
    key,
  ) as Promise<T>;
}

/** Нет прокрутки страницы, canvas ровно на весь экран (п. 1.10.2). */
export async function expectNoPageScroll(page: Page): Promise<void> {
  const metrics = await page.evaluate(() => {
    const canvas = document.querySelector('canvas')!.getBoundingClientRect();
    const root = document.scrollingElement!;
    return {
      viewport: [window.innerWidth, window.innerHeight],
      scroll: [root.scrollWidth, root.scrollHeight],
      canvas: [Math.round(canvas.width), Math.round(canvas.height)],
    };
  });
  expect(metrics.scroll).toEqual(metrics.viewport);
  expect(metrics.canvas).toEqual(metrics.viewport);
}

/**
 * Кнопки целиком в пределах экрана, не меньше 48 CSS-пикселей и не накрывают друг друга
 * (CLAUDE.md и п. 1.10.1, 1.10.3).
 */
export async function expectButtonsFit(page: Page): Promise<void> {
  const viewport = page.viewportSize()!;
  const buttons = await getButtons(page);
  expect(buttons.length).toBeGreaterThan(0);
  for (const button of buttons) {
    const where = `${button.scene}/${button.id} при ${viewport.width}×${viewport.height}`;
    expect(button.width, where).toBeGreaterThanOrEqual(48);
    expect(button.height, where).toBeGreaterThanOrEqual(48);
    expect(button.x, where).toBeGreaterThanOrEqual(-0.5);
    expect(button.y, where).toBeGreaterThanOrEqual(-0.5);
    expect(button.x + button.width, where).toBeLessThanOrEqual(viewport.width + 0.5);
    expect(button.y + button.height, where).toBeLessThanOrEqual(viewport.height + 0.5);
  }
  for (let i = 0; i < buttons.length; i += 1) {
    for (let j = i + 1; j < buttons.length; j += 1) {
      const a = buttons[i]!;
      const b = buttons[j]!;
      const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      expect(overlapX > 1 && overlapY > 1, `${a.id} накрывает ${b.id}`).toBe(false);
    }
  }
}

export async function screenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${SCREENS_DIR}${name}.png` });
}
