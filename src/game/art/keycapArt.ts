import { PHYSICS } from '../../config/balance';
import { Rng } from '../../core/run/rng';
import type { KeyDecor, KeyFinish, KeyGlyph, KeyPaint } from '../../themes';
import { FONT_FAMILY } from '../fonts';
import { heartPath, roundRectPath, starPath } from './canvas';
import { css, darken, hexToRgb, lighten, type Rgb } from './color';

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
  if (label.glyph === 'heart') return { x, y, w: size * 1.1, h: size * 0.95, r: 0 };
  return { x, y, w: size * 1.5 * 1.3, h: size * 1.5 * 0.9, r: 0 };
}

/** Цвета клавиши, из которых рисуются грани, обводка и надпись. */
export interface KeyColors {
  base: string;
  side: Rgb;
  outline: Rgb;
  label: Rgb;
}

/** Золото золотых клавиш: корпус, обводка и цвет искр. */
export const GOLD = {
  light: '#fff4b8',
  base: '#ffd24a',
  deep: '#eea52b',
  outline: '#a8680f',
  ring: '#ffe98f',
} as const;

export function keyColors(paint: KeyPaint, golden = false): KeyColors {
  const base = paint.kind === 'solid' ? paint.color : (paint.colors[3] ?? '#ffffff');
  return {
    base: golden ? GOLD.base : base,
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

/** Глубокий космос: в него «тонет» корпус космической клавиши, светится только край. */
const SPACE: Rgb = { r: 27, g: 23, b: 69 };

function toward(color: Rgb, target: Rgb, amount: number): Rgb {
  return {
    r: color.r + (target.r - color.r) * amount,
    g: color.g + (target.g - color.g) * amount,
    b: color.b + (target.b - color.b) * amount,
  };
}

/** Тёмный корпус космической клавиши с оттенком её цвета. */
function cosmicShade(hex: string): Rgb {
  return toward(hexToRgb(hex), SPACE, 0.62);
}

/** Как выглядит клавиша: золотая ли, отделка и узор. seed — чтобы узор у формы был всегда один. */
export interface KeyLook {
  golden?: boolean;
  finish?: KeyFinish;
  decor?: KeyDecor;
  seed?: number;
}

/** Золотой корпус: блестящий перелив по диагонали. */
function goldGradient(ctx: CanvasRenderingContext2D, box: Box): CanvasGradient {
  const gradient = ctx.createLinearGradient(box.x, box.y, box.x + box.w, box.y + box.h);
  gradient.addColorStop(0, GOLD.light);
  gradient.addColorStop(0.3, GOLD.base);
  gradient.addColorStop(0.62, GOLD.deep);
  gradient.addColorStop(0.82, GOLD.base);
  gradient.addColorStop(1, GOLD.light);
  return gradient;
}

/**
 * Рисует колпачок клавиши в ctx, начало координат — левый верхний угол корпуса,
 * единицы — единицы физики (масштаб выставляет вызывающий код).
 * У золотой клавиши золотой корпус и рамка, а верхняя грань своего цвета: форму легко узнать.
 * Отделка и узор — из данных мира (themes/): мармелад блестит, космос светится по краю.
 */
export function drawKeycap(
  ctx: CanvasRenderingContext2D,
  geometry: KeycapGeometry,
  paint: KeyPaint,
  label: LabelArt,
  look: KeyLook = {},
): void {
  const { body, top } = geometry;
  const golden = look.golden ?? false;
  const finish = look.finish ?? 'plastic';
  const cosmic = finish === 'cosmic' && !golden;
  const colors = keyColors(paint);
  const base = colors.base;

  // Корпус и боковая грань.
  roundRectPath(ctx, body.x, body.y, body.w, body.h, body.r);
  if (golden) ctx.fillStyle = goldGradient(ctx, body);
  else if (cosmic) ctx.fillStyle = paintGradient(ctx, paint, body, cosmicShade);
  else ctx.fillStyle = paintGradient(ctx, paint, body, (hex) => darken(hex, 0.28));
  ctx.fill();
  const lipShade = ctx.createLinearGradient(0, top.y + top.h * 0.6, 0, body.h);
  lipShade.addColorStop(0, 'rgba(40, 20, 70, 0)');
  lipShade.addColorStop(1, 'rgba(40, 20, 70, 0.22)');
  ctx.fillStyle = lipShade;
  ctx.fill();
  if (look.decor === 'stripes' && !golden) drawStripes(ctx, geometry);
  roundRectPath(ctx, body.x, body.y, body.w, body.h, body.r);
  if (cosmic) {
    // Светящийся край: широкая полупрозрачная обводка и тонкая яркая поверх.
    ctx.lineWidth = 4.5;
    ctx.strokeStyle = css(lighten(base, 0.2), 0.35);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = css(lighten(base, 0.35), 1);
  } else {
    ctx.lineWidth = golden ? 2.8 : 2.4;
    ctx.strokeStyle = golden ? GOLD.outline : css(colors.outline, 0.9);
  }
  ctx.stroke();
  if (cosmic) drawSpeckles(ctx, geometry, look.seed ?? 1);

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
  if (cosmic) {
    // Свет изнутри: верхняя грань светится от центра.
    const cx = top.x + top.w / 2;
    const cy = top.y + top.h / 2;
    const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(top.w, top.h) * 0.6);
    halo.addColorStop(0, 'rgba(255, 255, 255, 0.32)');
    halo.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = halo;
    ctx.fill();
  }
  ctx.lineWidth = finish === 'jelly' ? 1.8 : 1.4;
  ctx.strokeStyle = finish === 'jelly' ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255, 255, 255, 0.55)';
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
  if (finish === 'jelly') drawJellyShine(ctx, geometry);
  if (look.decor && look.decor !== 'stripes') {
    drawDecor(ctx, geometry, look.decor, base, new Rng(look.seed ?? 1));
  }

  drawLabel(ctx, geometry, colors.label, label);
  if (golden) drawGoldTrim(ctx, geometry);
}

/** Мармелад: крупный мягкий блик и пара пузырьков — клавиша как будто полупрозрачная. */
function drawJellyShine(ctx: CanvasRenderingContext2D, geometry: KeycapGeometry): void {
  const { top } = geometry;
  const m = Math.min(top.w, top.h);
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.beginPath();
  ctx.ellipse(
    top.x + top.w * 0.24,
    top.y + top.h * 0.32,
    top.w * 0.16,
    top.h * 0.12,
    -0.5,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  for (const [fx, fy, fr] of [
    [0.86, 0.72, 0.045],
    [0.8, 0.84, 0.028],
  ] as const) {
    ctx.beginPath();
    ctx.arc(top.x + top.w * fx, top.y + top.h * fy, m * fr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Звёздная пыль на тёмном корпусе космической клавиши (по боковой грани снизу). */
function drawSpeckles(ctx: CanvasRenderingContext2D, geometry: KeycapGeometry, seed: number): void {
  const { body, top } = geometry;
  const rng = new Rng(seed ^ 0x51ed);
  const lipTop = top.y + top.h;
  const count = Math.round(Math.min(14, Math.max(3, body.w / 14)));
  ctx.save();
  for (let i = 0; i < count; i += 1) {
    const x = body.x + body.r * 0.6 + rng.next() * (body.w - body.r * 1.2);
    const y = lipTop + 2 + rng.next() * Math.max(1, body.h - lipTop - 5);
    ctx.fillStyle = `rgba(255, 255, 255, ${0.45 + rng.next() * 0.45})`;
    ctx.beginPath();
    ctx.arc(x, y, 0.7 + rng.next() * 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Полоски леденца на корпусе: видны на боковой грани вокруг верхней. */
function drawStripes(ctx: CanvasRenderingContext2D, geometry: KeycapGeometry): void {
  const { body } = geometry;
  const step = Math.max(8, Math.min(body.w, body.h) * 0.22);
  ctx.save();
  roundRectPath(ctx, body.x, body.y, body.w, body.h, body.r);
  ctx.clip();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.lineWidth = step * 0.42;
  for (let x = -body.h; x < body.w + body.h; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, body.h + 2);
    ctx.lineTo(x + body.h, -2);
    ctx.stroke();
  }
  ctx.restore();
}

/** Посыпка драже: весёлые цвета, видные на любой глазури. */
const SPRINKLES = ['#ff5d9e', '#4fb9ff', '#ffcf3d', '#4fd69a', '#a979ff', '#ffffff'];

/**
 * Случайная точка у края верхней грани: лицо в середине и надпись в левом верхнем углу
 * остаются чистыми. null — подходящей точки не нашлось.
 */
function edgePoint(top: Box, rng: Rng, band: number): { x: number; y: number } | null {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const x = top.x + band * 0.5 + rng.next() * (top.w - band);
    const y = top.y + band * 0.5 + rng.next() * (top.h - band);
    const nearEdge =
      x - top.x < band || top.x + top.w - x < band || y - top.y < band || top.y + top.h - y < band;
    const onLabel = x < top.x + top.w * 0.36 && y < top.y + top.h * 0.4;
    if (nearEdge && !onLabel) return { x, y };
  }
  return null;
}

function drawDecor(
  ctx: CanvasRenderingContext2D,
  geometry: KeycapGeometry,
  decor: KeyDecor,
  base: string,
  rng: Rng,
): void {
  const { top } = geometry;
  const m = Math.min(top.w, top.h);
  const band = m * 0.22;
  ctx.save();
  roundRectPath(ctx, top.x, top.y, top.w, top.h, top.r);
  ctx.clip();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (decor) {
    case 'sprinkles': {
      const count = Math.round(Math.min(16, Math.max(6, (top.w * top.h) / 260)));
      ctx.lineWidth = Math.max(2, m * 0.04);
      for (let i = 0; i < count; i += 1) {
        const point = edgePoint(top, rng, band);
        if (!point) continue;
        const angle = rng.next() * Math.PI;
        const half = Math.max(3, m * 0.05);
        ctx.strokeStyle = SPRINKLES[i % SPRINKLES.length]!;
        ctx.beginPath();
        ctx.moveTo(point.x - Math.cos(angle) * half, point.y - Math.sin(angle) * half);
        ctx.lineTo(point.x + Math.cos(angle) * half, point.y + Math.sin(angle) * half);
        ctx.stroke();
      }
      break;
    }
    case 'chips': {
      const count = Math.round(Math.min(10, Math.max(5, (top.w * top.h) / 420)));
      for (let i = 0; i < count; i += 1) {
        const point = edgePoint(top, rng, band);
        if (!point) continue;
        const r = Math.max(2.2, m * (0.035 + rng.next() * 0.02));
        ctx.fillStyle = '#6b3a24';
        ctx.beginPath();
        ctx.ellipse(point.x, point.y, r, r * 0.8, rng.next() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.beginPath();
        ctx.arc(point.x - r * 0.3, point.y - r * 0.3, r * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'drizzle': {
      // Полоски глазури: сверху справа (надпись слева) и внизу — мимо лица.
      ctx.strokeStyle = css(lighten(base, 0.7), 0.9);
      ctx.lineWidth = Math.max(2, m * 0.045);
      const zigzag = (x0: number, x1: number, y: number, amp: number): void => {
        const step = Math.max(6, m * 0.12);
        ctx.beginPath();
        ctx.moveTo(x0, y);
        let up = true;
        for (let x = x0 + step; x <= x1; x += step) {
          ctx.lineTo(x, y + (up ? -amp : amp));
          up = !up;
        }
        ctx.stroke();
      };
      zigzag(top.x + top.w * 0.45, top.x + top.w - 4, top.y + top.h * 0.16, m * 0.05);
      zigzag(top.x + 4, top.x + top.w - 4, top.y + top.h * 0.9, m * 0.05);
      break;
    }
    case 'drips': {
      // Глазурь стекает с верхнего края: волнистый край с капельками.
      const icing = css(lighten(base, 0.78), 0.95);
      ctx.fillStyle = icing;
      const depth = top.h * 0.16;
      const drops = Math.max(3, Math.round(top.w / (m * 0.32)));
      const step = top.w / drops;
      ctx.beginPath();
      ctx.moveTo(top.x, top.y);
      ctx.lineTo(top.x + top.w, top.y);
      ctx.lineTo(top.x + top.w, top.y + depth * 0.6);
      for (let i = drops - 1; i >= 0; i -= 1) {
        const x = top.x + i * step;
        const long = depth * (0.7 + rng.next() * 0.9);
        ctx.quadraticCurveTo(x + step * 0.75, top.y + depth * 0.5, x + step * 0.5, top.y + long);
        ctx.quadraticCurveTo(x + step * 0.25, top.y + depth * 0.5, x, top.y + depth * 0.6);
      }
      ctx.closePath();
      ctx.fill();
      // Мягкий край глазури: видно и на светлых клавишах.
      ctx.strokeStyle = css(darken(base, 0.3), 0.35);
      ctx.lineWidth = 1.4;
      ctx.stroke();
      break;
    }
    case 'cherry': {
      const r = m * 0.11;
      const cx = top.x + top.w - r * 1.7;
      const cy = top.y + r * 1.6;
      ctx.strokeStyle = '#3f7a3a';
      ctx.lineWidth = Math.max(1.6, r * 0.22);
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 0.6);
      ctx.quadraticCurveTo(cx + r * 0.3, cy - r * 1.4, cx + r * 0.9, cy - r * 1.5);
      ctx.stroke();
      ctx.fillStyle = '#ff4d6d';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#b8233f';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.beginPath();
      ctx.arc(cx - r * 0.35, cy - r * 0.35, r * 0.28, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'stars': {
      const count = Math.round(Math.min(8, Math.max(3, (top.w * top.h) / 600)));
      for (let i = 0; i < count; i += 1) {
        const point = edgePoint(top, rng, band);
        if (!point) continue;
        ctx.fillStyle = i % 3 === 0 ? '#fff6b3' : 'rgba(255, 255, 255, 0.9)';
        starPath(ctx, point.x, point.y, Math.max(2.5, m * (0.04 + rng.next() * 0.03)), 4, 0.38);
        ctx.fill();
      }
      break;
    }
    case 'craters': {
      const count = Math.round(Math.min(5, Math.max(2, (top.w * top.h) / 700)));
      for (let i = 0; i < count; i += 1) {
        const point = edgePoint(top, rng, band);
        if (!point) continue;
        const r = Math.max(2.5, m * (0.045 + rng.next() * 0.035));
        ctx.fillStyle = css(darken(base, 0.18), 0.55);
        ctx.beginPath();
        ctx.arc(point.x, point.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.lineWidth = Math.max(1, r * 0.25);
        ctx.beginPath();
        ctx.arc(point.x, point.y, r, Math.PI * 0.9, Math.PI * 1.7);
        ctx.stroke();
      }
      break;
    }
    case 'rings': {
      // Кольцо планеты наискосок через нижнюю часть грани.
      const cx = top.x + top.w / 2;
      const cy = top.y + top.h * 0.8;
      ctx.lineWidth = Math.max(2.5, m * 0.07);
      ctx.strokeStyle = css(lighten(base, 0.55), 0.85);
      ctx.beginPath();
      ctx.ellipse(cx, cy, top.w * 0.56, top.h * 0.11, -0.08, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = Math.max(1, m * 0.02);
      ctx.strokeStyle = css(darken(base, 0.25), 0.6);
      ctx.beginPath();
      ctx.ellipse(cx, cy, top.w * 0.5, top.h * 0.085, -0.08, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'swirl': {
      // Завиток галактики: две спиральные руки из середины и пара звёздочек.
      const cx = top.x + top.w / 2;
      const cy = top.y + top.h / 2;
      const reach = Math.max(top.w, top.h) * 0.62;
      ctx.lineWidth = Math.max(2, m * 0.05);
      for (const start of [0, Math.PI]) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.beginPath();
        for (let t = 0; t <= 1; t += 0.04) {
          const angle = start + t * Math.PI * 1.6;
          const r = reach * (0.15 + 0.85 * t);
          const x = cx + Math.cos(angle) * r;
          const y = cy + Math.sin(angle) * r * (top.h / top.w);
          if (t === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      for (let i = 0; i < 4; i += 1) {
        const point = edgePoint(top, rng, band);
        if (!point) continue;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        starPath(ctx, point.x, point.y, Math.max(2, m * 0.035), 4, 0.38);
        ctx.fill();
      }
      break;
    }
    case 'stripes':
      break;
  }
  ctx.restore();
}

/** Золотая рамка вокруг верхней грани и пара искорок на углах. */
function drawGoldTrim(ctx: CanvasRenderingContext2D, geometry: KeycapGeometry): void {
  const { top, body } = geometry;
  const minSide = Math.min(body.w, body.h);
  roundRectPath(ctx, top.x, top.y, top.w, top.h, top.r);
  ctx.lineWidth = Math.max(2.2, minSide * 0.05);
  ctx.strokeStyle = GOLD.ring;
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = GOLD.outline;
  ctx.stroke();

  const spark = Math.max(4, minSide * 0.1);
  ctx.fillStyle = '#ffffff';
  starPath(ctx, top.x + top.w - spark * 0.9, top.y + spark * 0.9, spark, 4, 0.3);
  ctx.fill();
  starPath(ctx, body.x + spark * 0.9, body.h - spark * 0.8, spark * 0.7, 4, 0.3);
  ctx.fill();
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
  else if (label.glyph === 'heart') {
    heartPath(ctx, x + labelSize * 0.55, y + labelSize * 0.5, labelSize * 1.1);
    ctx.fillStyle = css(color, 0.8);
    ctx.fill();
  } else drawCrown(ctx, x, y, labelSize * 1.5);
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
