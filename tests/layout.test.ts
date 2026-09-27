import { describe, expect, it } from 'vitest';
import {
  LOGICAL_WIDTH,
  MAX_DPR,
  computeLayout,
  logicalToCss,
  type Layout,
} from '../src/core/layout';

const mobile = (cssWidth: number, cssHeight: number, devicePixelRatio = 2) =>
  computeLayout({ cssWidth, cssHeight, devicePixelRatio, isDesktop: false });
const desktop = (cssWidth: number, cssHeight: number, devicePixelRatio = 1) =>
  computeLayout({ cssWidth, cssHeight, devicePixelRatio, isDesktop: true });

/** Минимальная высота кнопки в логических пикселях (src/game/ui/Button.ts). */
const MIN_BUTTON_LOGICAL = 110;

function columnCss(layout: Layout) {
  return { width: layout.column.width / layout.dpr, height: layout.column.height / layout.dpr };
}

describe('computeLayout', () => {
  it('на телефоне в портрете колонка занимает весь экран', () => {
    const layout = mobile(390, 844, 3);
    expect(layout.dpr).toBe(MAX_DPR);
    expect(layout.canvasWidth).toBe(780);
    expect(layout.canvasHeight).toBe(1688);
    expect(layout.column).toEqual({ x: 0, y: 0, width: 780, height: 1688 });
    expect(layout.scale).toBeCloseTo(780 / LOGICAL_WIDTH);
    expect(layout.logicalHeight).toBeCloseTo((1688 * LOGICAL_WIDTH) / 780);
  });

  it('экран 360×640 — колонка на весь экран, логическая высота 1280', () => {
    const layout = mobile(360, 640);
    expect(layout.column).toEqual({ x: 0, y: 0, width: 720, height: 1280 });
    expect(layout.logicalHeight).toBeCloseTo(1280);
  });

  it('телефон в альбомной ориентации — колонка 360 px по центру, по бокам фон', () => {
    const layout = mobile(844, 390);
    expect(columnCss(layout)).toEqual({ width: 360, height: 390 });
    expect(layout.column.x).toBe((1688 - 720) / 2);
    expect(layout.logicalHeight).toBeCloseTo(780);
  });

  it('планшет в портрете — колонка 9:16 и фон по бокам', () => {
    const layout = mobile(768, 1024);
    expect(columnCss(layout)).toEqual({ width: 576, height: 1024 });
  });

  it('десктоп 1920×1080 — колонка во всю высоту, по центру', () => {
    const layout = desktop(1920, 1080);
    expect(layout.column.height).toBe(1080);
    expect(layout.column.width).toBe(608);
    expect(layout.column.x).toBe(656);
  });

  it('узкое высокое окно на десктопе ограничено соотношением 2:1 и центрировано по высоте', () => {
    const layout = desktop(400, 1000);
    expect(layout.column.width).toBe(400);
    expect(layout.column.height).toBe(800);
    expect(layout.column.y).toBe(100);
  });

  it('очень низкое окно на десктопе тоже не шире 2:1', () => {
    const layout = desktop(1280, 150);
    expect(layout.column.width).toBe(300);
    expect(layout.column.height).toBe(150);
  });

  it.each([
    [1280, 720],
    [1920, 1080],
    [1366, 768],
    [2560, 1080],
    [1920, 864],
    [1536, 1080],
    [1280, 1024],
    [3840, 2160],
    [800, 600],
  ])('десктоп %i×%i: длинная сторона колонки не больше двух коротких', (w, h) => {
    const { column } = desktop(w, h);
    const long = Math.max(column.width, column.height);
    const short = Math.min(column.width, column.height);
    expect(long).toBeLessThanOrEqual(short * 2 + 1);
    expect(column.x).toBeGreaterThanOrEqual(0);
    expect(column.x + column.width).toBeLessThanOrEqual(desktop(w, h).canvasWidth);
  });

  it.each([
    [360, 640, false],
    [390, 844, false],
    [844, 390, false],
    [768, 1024, false],
    [1280, 720, true],
    [1920, 1080, true],
    [1366, 768, true],
    [2560, 1080, true],
    [1920, 864, true],
    [1536, 1080, true],
    [320, 568, false],
  ])('%i×%i: кнопка минимальной высоты не меньше 48 CSS-пикселей', (w, h, isDesktop) => {
    const layout = computeLayout({
      cssWidth: w,
      cssHeight: h,
      devicePixelRatio: isDesktop ? 1 : 2,
      isDesktop,
    });
    expect(logicalToCss(layout, MIN_BUTTON_LOGICAL)).toBeGreaterThanOrEqual(48);
  });

  it('не ломается на нулевых и неверных размерах', () => {
    const layout = computeLayout({
      cssWidth: 0,
      cssHeight: Number.NaN,
      devicePixelRatio: Number.NaN,
      isDesktop: true,
    });
    expect(layout.dpr).toBe(1);
    expect(layout.canvasWidth).toBe(1);
    expect(layout.canvasHeight).toBe(1);
    expect(Number.isFinite(layout.scale)).toBe(true);
    expect(Number.isFinite(layout.logicalHeight)).toBe(true);
  });

  it('dpr меньше 1 поднимается до 1', () => {
    expect(mobile(360, 640, 0.5).dpr).toBe(1);
  });
});
