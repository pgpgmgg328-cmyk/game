import { PHYSICS } from '../../config/balance';
import type { KeyGlyph, KeyPaint } from '../../themes';
import { FONT_FAMILY } from '../fonts';
import { roundRectPath } from './canvas';
import { css, darken, lighten, type Rgb } from './color';

/** Прямоугольник относительно левого верхнего угла клавиши, в единицах физики. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
}

/** Колпачок: весь корпус и верхняя грань. Нижняя полоса корпуса — боковая грань для объёма. */
export interface KeycapGeometry {
  width: number;
  height: number;
  body: Box;
  top: Box;
  /** Размер надписи в углу. */
  labelSize: number;
}

export function keycapGeometry(width: number, height: number): KeycapGeometry {
  const minSide = Math.min(width, height);
  // Скругление как у тела в физике, чтобы клавиши на экране касались ровно там же, где в Matter.js.
  const radius = minSide * PHYSICS.chamferRatio;
  const inset = Math.max(3, minSide * 0.07);
  const lip = Math.max(6, height * 0.16);
  const top: Box = {
    x: inset,
    y: inset * 0.7,
    w: width - inset * 2,
    h: height - inset * 0.7 - lip,
    r: Math.max(4, radius - inset * 0.5),
  };
  return {
    width,
    height,
    body: { x: 0, y: 0, w: width, h: height, r: radius },
    top,
    labelSize: Math.min(20, Math.max(10, height * 0.17)),
  };
}

/** Что написано в углу клавиши: текст или нарисованный значок. */
export type LabelArt = { text: string } | { glyph: KeyGlyph };

function labelOrigin(geometry: KeycapGeometry): { x: number; y: number } {
  const { top } = geometry;
  return { x: top.x + Math.max(5, top.h * 0.1), y: top.y + Math.max(4, top.h * 0.13) };
}

/** Где на клавише надпись: чтобы лицо на неё не налезало. ctx нужен, чтобы измерить текст. */
export function labelBox(
  ctx: CanvasRenderingContext2D,
  geometry: KeycapGeometry,
  label: LabelArt,
): Box {
  const { x, y } = labelOrigin(geometry);
  const size = geometry.labelSize;
  if ('text' in label) {
    ctx.font = `900 ${size}px ${FONT_FAMILY}`;
    return { x, y, w: ctx.measureText(label.text).width, h: size * 0.95, r: 0 };
  }
  if (label.glyph === 'backspace') return { x, y, w: size * 1.45, h: size * 0.95, r: 0 };
  return { x, y, w: size * 1.5 * 1.3, h: size * 1.5 * 0.9, r: 0 };
}

/** Цвета клавиши, из которых рисуются грани, обводка и надпись. */
export interface KeyColors {
  base: string;
  side: Rgb;
  outline: Rgb;
  label: Rgb;
}

export function keyColors(paint: KeyPaint): KeyColors {
  const base = paint.kind === 'solid' ? paint.color : (paint.colors[3] ?? '#ffffff');
  return {
    base,
    side: darken(base, 0.28),
    outline: darken(base, 0.55),
    label: darken(base, 0.62),
  };
}

function paintGradient(
  ctx: CanvasRenderingContext2D,
  paint: KeyPaint,
  box: Box,
  shade: (hex: string) => Rgb,
): CanvasGradient | string {
  if (paint.kind === 'solid') return css(shade(paint.color));
  const gradient = ctx.createLinearGradient(box.x, 0, box.x + box.w, 0);
  paint.colors.forEach((color, index) =>
    gradient.addColorStop(index / Math.max(1, paint.colors.length - 1), css(shade(color))),
  );
  return gradient;
}

/**
 * Рисует колпачок клавиши в ctx, начало координат — левый верхний угол корпуса,
 * единицы — единицы физики (масштаб выставляет вызывающий код).
 */
export function drawKeycap(
  ctx: CanvasRenderingContext2D,
  geometry: KeycapGeometry,
  paint: KeyPaint,
  label: LabelArt,
): void {
  const { body, top } = geometry;
  const colors = keyColors(paint);

  // Корпус и боковая грань.
  roundRectPath(ctx, body.x, body.y, body.w, body.h, body.r);
  ctx.fillStyle = paintGradient(ctx, paint, body, (hex) => darken(hex, 0.28));
  ctx.fill();
  const lipShade = ctx.createLinearGradient(0, top.y + top.h * 0.6, 0, body.h);
  lipShade.addColorStop(0, 'rgba(40, 20, 70, 0)');
  lipShade.addColorStop(1, 'rgba(40, 20, 70, 0.22)');
  ctx.fillStyle = lipShade;
  ctx.fill();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = css(colors.outline, 0.9);
  ctx.stroke();

  // Верхняя грань: светлее сверху, с мягким градиентом.
  roundRectPath(ctx, top.x, top.y, top.w, top.h, top.r);
  ctx.fillStyle = paintGradient(ctx, paint, top, (hex) => lighten(hex, 0.12));
  ctx.fill();
  const glow = ctx.createLinearGradient(0, top.y, 0, top.y + top.h);
  glow.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
  glow.addColorStop(0.55, 'rgba(255, 255, 255, 0.08)');
  glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = glow;
  ctx.fill();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.stroke();

  // Блик вдоль верхнего края.
  const shineHeight = Math.max(3, top.h * 0.09);
  roundRectPath(
    ctx,
    top.x + top.w * 0.14,
    top.y + top.h * 0.06,
    top.w * 0.72,
    shineHeight,
    shineHeight / 2,
  );
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.fill();

  drawLabel(ctx, geometry, colors.label, label);
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  geometry: KeycapGeometry,
  color: Rgb,
  label: LabelArt,
): void {
  const { labelSize } = geometry;
  const { x, y } = labelOrigin(geometry);
  if ('text' in label) {
    ctx.font = `900 ${labelSize}px ${FONT_FAMILY}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = css(color, 0.8);
    ctx.fillText(label.text, x, y);
    return;
  }
  if (label.glyph === 'backspace') drawBackspace(ctx, x, y, labelSize, color);
  else drawCrown(ctx, x, y, labelSize * 1.5);
}

/** Значок ⌫: стрелка-табличка с крестиком (в шрифте его нет). */
function drawBackspace(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: Rgb,
): void {
  const w = size * 1.45;
  const h = size * 0.95;
  const tip = h * 0.5;
  ctx.beginPath();
  ctx.moveTo(x, y + h / 2);
  ctx.lineTo(x + tip, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + tip, y + h);
  ctx.closePath();
  ctx.lineWidth = size * 0.13;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = css(color, 0.8);
  ctx.stroke();
  const cx = x + tip + (w - tip) / 2;
  const cy = y + h / 2;
  const d = h * 0.2;
  ctx.beginPath();
  ctx.moveTo(cx - d, cy - d);
  ctx.lineTo(cx + d, cy + d);
  ctx.moveTo(cx + d, cy - d);
  ctx.lineTo(cx - d, cy + d);
  ctx.lineCap = 'round';
  ctx.stroke();
}

/** Корона Пробела вместо надписи. */
export function drawCrown(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  const w = size * 1.3;
  const h = size * 0.9;
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + h * 0.3);
  ctx.lineTo(x + w * 0.27, y + h * 0.6);
  ctx.lineTo(x + w * 0.5, y);
  ctx.lineTo(x + w * 0.73, y + h * 0.6);
  ctx.lineTo(x + w, y + h * 0.3);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.fillStyle = '#ffd65c';
  ctx.fill();
  ctx.lineWidth = size * 0.08;
  ctx.strokeStyle = '#b8801f';
  ctx.stroke();
  ctx.fillStyle = '#ff7f9f';
  for (const [px, py] of [
    [0.5, 0.62],
    [0.2, 0.8],
    [0.8, 0.8],
  ] as const) {
    ctx.beginPath();
    ctx.arc(x + w * px, y + h * py, size * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }
}
