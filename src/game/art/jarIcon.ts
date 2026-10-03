import Phaser from 'phaser';
import type { ThemePalette } from '../../themes';
import type { JarPattern, JarSkin } from '../../themes/decor';
import { hexToNumber } from './color';

/** Радуга банки «Радуга» (за неделю заданий подряд) и других радужных значков. */
export const RAINBOW = [0xff9aa2, 0xffc98f, 0xfff08a, 0x9ff0cf, 0x8fd3ff, 0xc3a8ff];

/** Как выглядит маленькая банка на значке: цвет стекла, края и узор украшения (если есть). */
export interface JarIconLook {
  glass: number;
  edge: number;
  pattern?: JarPattern;
  /** Цвет узора: полосок, звёздочек, облачков. */
  accent?: number;
}

/** Значок банки-украшения; обычная банка — в цветах мира. */
export function jarIconLook(skin: JarSkin, palette: ThemePalette): JarIconLook {
  const { look } = skin;
  if (!look) return { glass: hexToNumber(palette.glass), edge: hexToNumber(palette.glassEdge) };
  return {
    glass: hexToNumber(look.glass),
    edge: hexToNumber(look.edge),
    pattern: look.pattern,
    accent: hexToNumber(look.accent),
  };
}

/** Пятиконечная звёздочка (для узоров банки). */
export function fillStar(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  radius: number,
): void {
  const points: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 === 0 ? radius : radius * 0.45;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    points.push(new Phaser.Math.Vector2(x + Math.cos(angle) * r, y + Math.sin(angle) * r));
  }
  g.fillPoints(points, true);
}

/** Пухлое облачко из кружков; size — примерная ширина. */
export function fillCloud(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  size: number,
): void {
  for (const [dx, dy, r] of [
    [-0.32, 0.06, 0.2],
    [-0.06, -0.1, 0.27],
    [0.26, -0.02, 0.22],
    [0.02, 0.12, 0.22],
  ] as const) {
    g.fillCircle(x + dx * size, y + dy * size, r * size);
  }
}

/**
 * Маленькая банка для значков (задания, магазин украшений): корпус со скруглённым низом,
 * узор украшения внутри, кромка сверху и блик. size — высота значка.
 */
export function drawJarIcon(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  size: number,
  look: JarIconLook,
): void {
  const w = size * 0.74;
  const h = size * 0.86;
  const left = x - w / 2;
  const top = y - h / 2 + size * 0.06;
  const radius = { tl: size * 0.06, tr: size * 0.06, bl: size * 0.2, br: size * 0.2 };
  g.fillStyle(look.glass, 0.9);
  g.fillRoundedRect(left, top, w, h, radius);
  if (look.pattern) {
    drawIconPattern(g, look.pattern, look.accent ?? 0xffffff, look.edge, {
      left,
      top,
      w,
      h,
      size,
      bottom: radius.bl,
    });
  }
  g.lineStyle(Math.max(3, size * 0.06), look.edge, 1);
  g.strokeRoundedRect(left, top, w, h, radius);
  // Кромка и блик.
  g.fillStyle(look.edge, 1);
  g.fillRoundedRect(
    left - size * 0.06,
    top - size * 0.07,
    w + size * 0.12,
    size * 0.11,
    size * 0.05,
  );
  g.fillStyle(0xffffff, 0.6);
  g.fillRoundedRect(left + size * 0.1, top + size * 0.12, size * 0.07, h * 0.5, size * 0.035);
}

interface IconBox {
  left: number;
  top: number;
  w: number;
  h: number;
  size: number;
  /** Скругление низа банки. */
  bottom: number;
}

/** Узор внутри стекла значка: радужные полосы, полоски леденца, звёздочки или облачка. */
function drawIconPattern(
  g: Phaser.GameObjects.Graphics,
  pattern: JarPattern,
  accent: number,
  edge: number,
  box: IconBox,
): void {
  const { left, top, w, h, size } = box;
  if (pattern === 'rainbow') {
    // Полосы снизу вверх, внутри стекла.
    const band = (h - size * 0.12) / RAINBOW.length;
    RAINBOW.forEach((color, index) => {
      g.fillStyle(color, 0.9);
      const bottom = index === 0 ? box.bottom * 0.8 : 0;
      g.fillRoundedRect(
        left + size * 0.05,
        top + h - (index + 1) * band - size * 0.05,
        w - size * 0.1,
        band,
        { tl: 0, tr: 0, bl: bottom, br: bottom },
      );
    });
    return;
  }
  // Стекло чуть подкрашено цветом края: светлый узор на нём виден и на белой карточке.
  g.fillStyle(edge, 0.45);
  g.fillRoundedRect(left, top, w, h, {
    tl: size * 0.06,
    tr: size * 0.06,
    bl: box.bottom,
    br: box.bottom,
  });
  const cx = left + w / 2;
  const cy = top + h / 2;
  g.fillStyle(accent, 1);
  switch (pattern) {
    case 'stripes': {
      // Наклонные полоски леденца поперёк стекла.
      const inner = { left: left + size * 0.05, right: left + w - size * 0.05 };
      for (let i = 0; i < 3; i += 1) {
        const y0 = top + size * 0.1 + i * size * 0.2;
        g.fillPoints(
          [
            new Phaser.Math.Vector2(inner.left, y0 + size * 0.12),
            new Phaser.Math.Vector2(inner.right, y0),
            new Phaser.Math.Vector2(inner.right, y0 + size * 0.08),
            new Phaser.Math.Vector2(inner.left, y0 + size * 0.2),
          ],
          true,
        );
      }
      return;
    }
    case 'stars':
      fillStar(g, cx - size * 0.12, cy - size * 0.1, size * 0.11);
      fillStar(g, cx + size * 0.13, cy + size * 0.04, size * 0.08);
      fillStar(g, cx - size * 0.06, cy + size * 0.2, size * 0.07);
      return;
    case 'clouds':
      fillCloud(g, cx - size * 0.04, cy - size * 0.08, size * 0.36);
      fillCloud(g, cx + size * 0.08, cy + size * 0.18, size * 0.26);
      return;
  }
}
