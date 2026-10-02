import { Rng } from '../../core/run/rng';
import type { ThemeBackdrop, ThemePalette } from '../../themes';
import { roundRectPath, starPath } from './canvas';

/**
 * Плитка узора: восемь клавиш в ряд, четыре ряда. Размер — степень двойки, чтобы WebGL повторял
 * её без растяжения; края совпадают, узор идёт без швов.
 */
export const PATTERN_TILE = { width: 512, height: 256 } as const;
const KEY = 64;
const GAP = 10;

/** Ряды клавиатуры: сдвиг ряда и ширины клавиш (в клавишах). Третий ряд — с «пробелом». */
const ROWS: readonly { offset: number; widths: readonly number[] }[] = [
  { offset: 0, widths: [1, 1, 1, 1, 1, 1, 1, 1] },
  { offset: 32, widths: [1, 1, 1, 1, 1, 1, 1, 1] },
  { offset: 16, widths: [1, 1, 1, 3, 1, 1] },
  { offset: 48, widths: [1, 1, 1, 1, 1, 1, 1, 1] },
];

/** Узор клавиатуры (диздок, раздел 12): мягкие клавиши с верхней гранью, цвета из палитры мира. */
export function drawKeyboardPattern(ctx: CanvasRenderingContext2D, palette: ThemePalette): void {
  ROWS.forEach((row, index) => {
    let x = row.offset;
    for (const width of row.widths) {
      const w = width * KEY - GAP;
      // Клавиша у правого края продолжается слева: плитка стыкуется без шва.
      for (const shift of [0, -PATTERN_TILE.width]) {
        drawPatternKey(ctx, x + shift + GAP / 2, index * KEY + GAP / 2, w, KEY - GAP, palette);
      }
      x += width * KEY;
    }
  });
}

function drawPatternKey(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  palette: ThemePalette,
): void {
  roundRectPath(ctx, x, y, w, h, 13);
  ctx.fillStyle = palette.pattern;
  ctx.globalAlpha = 0.75;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 3;
  ctx.strokeStyle = palette.patternLine;
  ctx.stroke();
  roundRectPath(ctx, x + 6, y + 5, w - 12, h - 17, 9);
  ctx.fillStyle = palette.pattern;
  ctx.fill();
}

/** Плитка украшений фона мира: звёздочки (космос) или цветная посыпка (сладкий мир). */
export const SPARKLE_TILE = { width: 256, height: 256 } as const;

/** Есть ли у мира украшения фона. */
export function hasSparkles(backdrop: ThemeBackdrop): boolean {
  return backdrop.stars !== undefined || (backdrop.sprinkles?.length ?? 0) > 0;
}

/** Звёздочки и точки разного размера или посыпка — всегда в одних и тех же местах плитки. */
export function drawBackdropSparkles(ctx: CanvasRenderingContext2D, backdrop: ThemeBackdrop): void {
  const { width, height } = SPARKLE_TILE;
  const rng = new Rng(0x5eed);
  // Фигурка у края рисуется и с другой стороны плитки: стык без шва.
  const everywhere = (x: number, y: number, draw: (px: number, py: number) => void): void => {
    for (const dx of [-width, 0, width])
      for (const dy of [-height, 0, height]) draw(x + dx, y + dy);
  };
  if (backdrop.stars) {
    ctx.fillStyle = backdrop.stars;
    for (let i = 0; i < 26; i += 1) {
      const x = rng.next() * width;
      const y = rng.next() * height;
      const big = i % 5 === 0;
      const size = big ? 5 + rng.next() * 3 : 1 + rng.next() * 1.6;
      ctx.globalAlpha = big ? 0.95 : 0.5 + rng.next() * 0.45;
      everywhere(x, y, (px, py) => {
        if (big) starPath(ctx, px, py, size, 4, 0.36);
        else {
          ctx.beginPath();
          ctx.arc(px, py, size, 0, Math.PI * 2);
        }
        ctx.fill();
      });
    }
  }
  const sprinkles = backdrop.sprinkles ?? [];
  if (sprinkles.length > 0) {
    ctx.lineCap = 'round';
    ctx.lineWidth = 5;
    for (let i = 0; i < 20; i += 1) {
      const x = rng.next() * width;
      const y = rng.next() * height;
      const angle = rng.next() * Math.PI;
      ctx.strokeStyle = sprinkles[i % sprinkles.length]!;
      ctx.globalAlpha = 0.8;
      everywhere(x, y, (px, py) => {
        ctx.beginPath();
        ctx.moveTo(px - Math.cos(angle) * 7, py - Math.sin(angle) * 7);
        ctx.lineTo(px + Math.cos(angle) * 7, py + Math.sin(angle) * 7);
        ctx.stroke();
      });
    }
  }
  ctx.globalAlpha = 1;
}

/** Плитка ближнего слоя: редкие клавиши разного размера, чуть повёрнутые, как будто парят. */
export const FLOATING_TILE = { width: 512, height: 512 } as const;

const FLOATING: readonly [x: number, y: number, w: number, h: number, angle: number][] = [
  [70, 90, 74, 74, -0.2],
  [310, 60, 104, 74, 0.14],
  [440, 270, 66, 66, 0.3],
  [160, 320, 118, 80, -0.12],
  [350, 440, 74, 74, 0.24],
  [40, 470, 62, 62, 0.1],
];

export function drawFloatingKeys(ctx: CanvasRenderingContext2D, palette: ThemePalette): void {
  const { width, height } = FLOATING_TILE;
  for (const [x, y, w, h, angle] of FLOATING) {
    // Клавиша у края рисуется и с другой стороны плитки: стык без шва.
    for (const dx of [-width, 0, width]) {
      for (const dy of [-height, 0, height]) {
        ctx.save();
        ctx.translate(x + dx, y + dy);
        ctx.rotate(angle);
        drawPatternKey(ctx, -w / 2, -h / 2, w, h, palette);
        ctx.restore();
      }
    }
  }
}
