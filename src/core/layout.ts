/** Логическая ширина игровой колонки. Высота колонки подстраивается под экран. */
export const LOGICAL_WIDTH = 720;

/** devicePixelRatio выше 2 не используем: на глаз разницы нет, а памяти и времени кадра уходит больше. */
export const MAX_DPR = 2;

/** Самая узкая колонка в CSS-пикселях, если экран позволяет (например, телефон в альбомной ориентации). */
export const MIN_COLUMN_CSS_WIDTH = 360;

/** На широком экране колонка портретная, 9:16, а по бокам виден фон. */
const PORTRAIT_WIDTH_TO_HEIGHT = 9 / 16;

/** На десктопе длинная сторона активного поля не больше двух коротких (требования, п. 1.6.2.2). */
const DESKTOP_MAX_ASPECT = 2;

export interface ViewportInfo {
  /** Размер области игры в CSS-пикселях. */
  cssWidth: number;
  cssHeight: number;
  devicePixelRatio: number;
  isDesktop: boolean;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Layout {
  /** Используемая плотность пикселей (не больше MAX_DPR). */
  dpr: number;
  /** Размер canvas в физических пикселях. */
  canvasWidth: number;
  canvasHeight: number;
  /** Игровая колонка в физических пикселях canvas. */
  column: Rect;
  /** Сколько физических пикселей в одном логическом. */
  scale: number;
  /** Высота колонки в логических пикселях (ширина всегда LOGICAL_WIDTH). */
  logicalHeight: number;
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Раскладка экрана: canvas на весь экран, портретная колонка по центру.
 * Колонка занимает всю высоту (п. 1.6.2.1), а на узком экране — всю ширину.
 */
export function computeLayout(viewport: ViewportInfo): Layout {
  const dpr = Math.min(MAX_DPR, Math.max(1, finiteOr(viewport.devicePixelRatio, 1)));
  const cssWidth = Math.max(1, Math.floor(finiteOr(viewport.cssWidth, 1)));
  const cssHeight = Math.max(1, Math.floor(finiteOr(viewport.cssHeight, 1)));

  let columnCssWidth = Math.min(
    cssWidth,
    Math.max(cssHeight * PORTRAIT_WIDTH_TO_HEIGHT, MIN_COLUMN_CSS_WIDTH),
  );
  let columnCssHeight = cssHeight;
  if (viewport.isDesktop) {
    columnCssWidth = Math.min(columnCssWidth, columnCssHeight * DESKTOP_MAX_ASPECT);
    columnCssHeight = Math.min(columnCssHeight, columnCssWidth * DESKTOP_MAX_ASPECT);
  }

  const canvasWidth = Math.round(cssWidth * dpr);
  const canvasHeight = Math.round(cssHeight * dpr);
  const width = Math.max(1, Math.round(columnCssWidth * dpr));
  const height = Math.max(1, Math.round(columnCssHeight * dpr));
  const scale = width / LOGICAL_WIDTH;

  return {
    dpr,
    canvasWidth,
    canvasHeight,
    column: {
      x: Math.round((canvasWidth - width) / 2),
      y: Math.round((canvasHeight - height) / 2),
      width,
      height,
    },
    scale,
    logicalHeight: height / scale,
  };
}

/** Размер логической величины в CSS-пикселях (например, чтобы проверить, что кнопка не меньше 48 px). */
export function logicalToCss(layout: Layout, logical: number): number {
  return (logical * layout.scale) / layout.dpr;
}
