import type { BrowStyle, EyeStyle, FaceData, MouthStyle } from '../../themes';
import { starPath } from './canvas';
import type { Box, KeycapGeometry } from './keycapArt';

/** Кадры лица: обычное, моргание, «сплющилось» от тапа. */
export type FaceFrame = 'open' | 'blink' | 'squish';
export const FACE_FRAMES: readonly FaceFrame[] = ['open', 'blink', 'squish'];

/** Где на клавише лицо и какого оно размера (в единицах физики). */
export interface FaceLayout {
  /** Базовый размер лица: от него считаются глаза, рот и остальное. */
  size: number;
  /** Центр лица относительно центра клавиши. */
  offsetX: number;
  offsetY: number;
  /** Размер кадра лица. */
  frameWidth: number;
  frameHeight: number;
}

/** Половина ширины глаз с бровями в долях размера лица. */
const UPPER_HALF = 0.38;

/** Границы лица в долях его размера: от бровей до рта и от румянца до румянца. */
function faceExtents(face: FaceData): { top: number; bottom: number; half: number } {
  const extras = face.extras ?? [];
  let top = face.eyes === 'big' || face.eyes === 'star' ? -0.25 : -0.21;
  if (face.brows !== 'none') top = -0.4;
  if (extras.includes('glasses')) top = Math.min(top, -0.27);
  const open = face.mouth === 'grin' || face.mouth === 'shout' || extras.includes('tongue');
  return {
    top,
    bottom: open ? 0.4 : 0.3,
    half: face.blush || extras.includes('glasses') ? 0.53 : 0.42,
  };
}

/**
 * Лицо — по центру верхней грани и как можно крупнее. Если оно налезает на надпись в углу,
 * лицо уменьшается и опускается под надпись.
 */
export function faceLayout(
  geometry: KeycapGeometry,
  face: FaceData,
  label: Box | null,
): FaceLayout {
  const { top, width, height } = geometry;
  const extents = faceExtents(face);
  const small = Math.min(width, height) < 80;
  let size = Math.min(top.w * (small ? 0.9 : 0.8), top.h * (small ? 1.25 : 1.1));
  const cx = top.x + top.w / 2;
  let cy = top.y + top.h * 0.56;
  const bottomLimit = top.y + top.h - 2;
  if (cy + extents.bottom * size > bottomLimit) cy = bottomLimit - extents.bottom * size;

  // Точка и запятая в углу крошечные: ради них лицо не уменьшаем.
  if (label && label.w > top.w * 0.13) {
    // С надписью в углу может столкнуться только верх лица: глаза и брови. Румянец ниже.
    const overlaps =
      cx - UPPER_HALF * size < label.x + label.w + 2 &&
      cy + extents.top * size < label.y + label.h + 2;
    if (overlaps) {
      const below = label.y + label.h + 2;
      size = Math.min(size, (bottomLimit - below) / (extents.bottom - extents.top));
      cy = below - extents.top * size;
    }
  }
  return {
    size,
    offsetX: cx - width / 2,
    offsetY: cy - height / 2,
    frameWidth: Math.ceil(size * 1.7),
    frameHeight: Math.ceil(size * 1.25),
  };
}

const TONGUE = '#ff86a6';
const BLUSH = 'rgba(255, 110, 160, 0.38)';

interface Pen {
  ctx: CanvasRenderingContext2D;
  /** Размер лица. */
  s: number;
  color: string;
  line: number;
}

/** Рисует лицо с центром в (0, 0). */
export function drawFace(
  ctx: CanvasRenderingContext2D,
  face: FaceData,
  frame: FaceFrame,
  size: number,
  color: string,
): void {
  const pen: Pen = { ctx, s: size, color, line: Math.max(2, size * 0.06) };
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const extras = face.extras ?? [];

  if (face.blush || frame === 'squish') drawBlush(pen);
  const eyeY = -size * 0.1;
  const eyeX = size * 0.26;
  for (const side of [-1, 1] as const) {
    drawEye(pen, eyeFor(face.eyes, side, frame), side * eyeX, eyeY, side);
    if (frame !== 'squish') drawBrow(pen, face.brows, side * eyeX, eyeY - size * 0.21, side);
  }
  if (extras.includes('glasses')) drawGlasses(pen, eyeX, eyeY);
  drawMouth(pen, frame === 'squish' ? 'o' : face.mouth, extras.includes('tongue'));
  if (extras.includes('zzz') && frame !== 'squish') drawZzz(pen);
  if (extras.includes('sparkles')) drawSparkles(pen);
}

type EyeShape = EyeStyle | 'closed' | 'squeezed';

function eyeFor(style: EyeStyle, side: -1 | 1, frame: FaceFrame): EyeShape {
  if (frame === 'squish') return 'squeezed';
  if (frame === 'blink') return style === 'happy' ? 'happy' : 'closed';
  if (style === 'wink') return side === 1 ? 'happy' : 'round';
  return style;
}

function drawEye(pen: Pen, shape: EyeShape, x: number, y: number, side: -1 | 1): void {
  const { ctx, s, color } = pen;
  const rx = s * 0.075;
  const ry = s * 0.092;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = pen.line;
  switch (shape) {
    case 'round':
    case 'shy':
    case 'big':
    case 'star': {
      const big = shape === 'big' || shape === 'star' ? 1.3 : 1;
      const dx = shape === 'shy' ? -side * rx * 0.15 - rx * 0.25 : 0;
      const dy = shape === 'shy' ? ry * 0.3 : 0;
      ellipse(ctx, x + dx, y + dy, rx * big, ry * big);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      if (shape === 'star') {
        starPath(ctx, x + dx, y + dy - ry * 0.1, ry * big * 0.62, 4, 0.38);
        ctx.fill();
      } else {
        const gx = shape === 'shy' ? -rx * 0.35 : rx * 0.35;
        ellipse(ctx, x + dx + gx * big, y + dy - ry * 0.38 * big, rx * 0.36 * big, rx * 0.36 * big);
        ctx.fill();
        ellipse(
          ctx,
          x + dx - gx * big * 0.8,
          y + dy + ry * 0.35 * big,
          rx * 0.17 * big,
          rx * 0.17 * big,
        );
        ctx.fill();
      }
      return;
    }
    case 'happy':
      ctx.beginPath();
      ctx.moveTo(x - rx * 1.25, y + ry * 0.35);
      ctx.quadraticCurveTo(x, y - ry * 1.35, x + rx * 1.25, y + ry * 0.35);
      ctx.stroke();
      return;
    case 'closed':
      ctx.beginPath();
      ctx.moveTo(x - rx * 1.2, y);
      ctx.quadraticCurveTo(x, y + ry * 1.0, x + rx * 1.2, y);
      ctx.stroke();
      return;
    case 'sleepy':
      // Веко опущено наполовину: видна нижняя половинка глаза под чуть изогнутым веком.
      ctx.beginPath();
      ctx.ellipse(x, y + ry * 0.15, rx * 0.8, ry * 0.62, 0, 0, Math.PI);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = pen.line * 0.8;
      ctx.beginPath();
      ctx.moveTo(x - rx * 1.3, y + ry * 0.05);
      ctx.quadraticCurveTo(x, y + ry * 0.35, x + rx * 1.3, y + ry * 0.05);
      ctx.stroke();
      return;
    case 'sly': {
      // Прищур: видна нижняя часть глаза, веко наклонено к носу.
      ctx.save();
      ctx.beginPath();
      ctx.rect(x - rx * 2, y - ry * 0.05, rx * 4, ry * 2);
      ctx.clip();
      ellipse(ctx, x, y, rx * 1.05, ry);
      ctx.fill();
      ctx.restore();
      ctx.beginPath();
      ctx.moveTo(x + side * rx * 1.35, y - ry * 0.3);
      ctx.lineTo(x - side * rx * 1.35, y + ry * 0.05);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ellipse(ctx, x + rx * 0.3, y + ry * 0.35, rx * 0.25, rx * 0.25);
      ctx.fill();
      return;
    }
    case 'squeezed':
      // «> <»: левый глаз смотрит уголком к носу, правый — зеркально.
      ctx.beginPath();
      ctx.moveTo(x - side * rx * 0.9, y - ry * 0.85);
      ctx.lineTo(x + side * rx * 0.9, y);
      ctx.lineTo(x - side * rx * 0.9, y + ry * 0.85);
      ctx.stroke();
      return;
  }
}

function drawBrow(pen: Pen, style: BrowStyle, x: number, y: number, side: -1 | 1): void {
  if (style === 'none') return;
  const { ctx, s } = pen;
  const w = s * 0.1;
  ctx.strokeStyle = pen.color;
  ctx.lineWidth = pen.line * 0.85;
  ctx.beginPath();
  const raisedArc = (lift: number): void => {
    ctx.moveTo(x - w, y + s * 0.02 - lift);
    ctx.quadraticCurveTo(x, y - s * 0.06 - lift, x + w, y + s * 0.02 - lift);
  };
  // Точка брови ближе к носу и дальше от него.
  const inner = x - side * w;
  const outer = x + side * w;
  switch (style) {
    case 'raised':
      raisedArc(s * 0.02);
      break;
    case 'sly':
      if (side === 1) raisedArc(s * 0.04);
      else {
        ctx.moveTo(outer, y - s * 0.02);
        ctx.lineTo(inner, y + s * 0.03);
      }
      break;
    case 'worried':
      ctx.moveTo(outer, y + s * 0.03);
      ctx.lineTo(inner, y - s * 0.04);
      break;
    case 'proud':
      ctx.moveTo(x - w * 1.05, y + s * 0.03);
      ctx.lineTo(x + w * 1.05, y + s * 0.03);
      break;
    case 'cheeky':
      if (side === -1) raisedArc(s * 0.05);
      else {
        ctx.moveTo(outer, y - s * 0.03);
        ctx.lineTo(inner, y + s * 0.04);
      }
      break;
  }
  ctx.stroke();
}

function drawMouth(pen: Pen, style: MouthStyle, tongue: boolean): void {
  const { ctx, s, color } = pen;
  const y = s * 0.17;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = pen.line;
  switch (style) {
    case 'o':
      ellipse(ctx, 0, y + s * 0.02, s * 0.055, s * 0.068);
      ctx.fill();
      break;
    case 'smile':
      ctx.beginPath();
      ctx.moveTo(-s * 0.12, y - s * 0.02);
      ctx.quadraticCurveTo(0, y + s * 0.11, s * 0.12, y - s * 0.02);
      ctx.stroke();
      break;
    case 'grin':
    case 'shout': {
      const w = style === 'grin' ? s * 0.15 : s * 0.12;
      const depth = style === 'grin' ? s * 0.24 : s * 0.32;
      ctx.beginPath();
      if (style === 'grin') {
        ctx.moveTo(-w, y - s * 0.03);
        ctx.lineTo(w, y - s * 0.03);
        ctx.quadraticCurveTo(0, y - s * 0.03 + depth, -w, y - s * 0.03);
      } else {
        ctx.ellipse(0, y + s * 0.04, w, depth / 2.1, 0, 0, Math.PI * 2);
      }
      ctx.closePath();
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = TONGUE;
      ellipse(ctx, 0, y + depth * (style === 'grin' ? 0.42 : 0.55), w * 0.62, depth * 0.24);
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'smirk':
      ctx.beginPath();
      ctx.moveTo(-s * 0.1, y + s * 0.01);
      ctx.quadraticCurveTo(s * 0.03, y + s * 0.09, s * 0.13, y - s * 0.05);
      ctx.stroke();
      break;
    case 'wavy':
      ctx.beginPath();
      ctx.moveTo(-s * 0.11, y + s * 0.02);
      ctx.bezierCurveTo(-s * 0.06, y - s * 0.04, -s * 0.02, y + s * 0.07, s * 0.02, y + s * 0.02);
      ctx.bezierCurveTo(s * 0.05, y - s * 0.02, s * 0.08, y + s * 0.05, s * 0.11, y + s * 0.01);
      ctx.stroke();
      break;
  }
  if (tongue && style !== 'o') {
    ctx.fillStyle = TONGUE;
    ellipse(ctx, s * 0.05, y + s * 0.17, s * 0.06, s * 0.07);
    ctx.fill();
    ctx.strokeStyle = 'rgba(190, 60, 100, 0.6)';
    ctx.lineWidth = pen.line * 0.45;
    ctx.beginPath();
    ctx.moveTo(s * 0.05, y + s * 0.13);
    ctx.lineTo(s * 0.05, y + s * 0.2);
    ctx.stroke();
  }
}

function drawBlush(pen: Pen): void {
  const { ctx, s } = pen;
  ctx.fillStyle = BLUSH;
  for (const side of [-1, 1]) {
    ellipse(ctx, side * s * 0.43, s * 0.07, s * 0.1, s * 0.058);
    ctx.fill();
  }
}

function drawGlasses(pen: Pen, eyeX: number, eyeY: number): void {
  const { ctx, s } = pen;
  const r = s * 0.155;
  ctx.lineWidth = pen.line * 0.8;
  ctx.strokeStyle = pen.color;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  for (const side of [-1, 1]) {
    ellipse(ctx, side * eyeX, eyeY, r, r * 0.92);
    ctx.fill();
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(-eyeX + r, eyeY - r * 0.1);
  ctx.quadraticCurveTo(0, eyeY - r * 0.45, eyeX - r, eyeY - r * 0.1);
  ctx.stroke();
}

function drawZzz(pen: Pen): void {
  const { ctx, s } = pen;
  ctx.strokeStyle = pen.color;
  ctx.lineWidth = pen.line * 0.6;
  const letter = (x: number, y: number, size: number): void => {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + size, y);
    ctx.lineTo(x, y + size);
    ctx.lineTo(x + size, y + size);
    ctx.stroke();
  };
  letter(s * 0.5, -s * 0.36, s * 0.11);
  letter(s * 0.64, -s * 0.52, s * 0.08);
}

function drawSparkles(pen: Pen): void {
  const { ctx, s } = pen;
  ctx.fillStyle = '#ffffff';
  for (const [x, y, r] of [
    [-0.66, -0.36, 0.09],
    [0.64, -0.28, 0.07],
    [0.58, 0.34, 0.055],
  ] as const) {
    starPath(ctx, x * s, y * s, r * s, 4, 0.35);
    ctx.fill();
  }
}

function ellipse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
}
