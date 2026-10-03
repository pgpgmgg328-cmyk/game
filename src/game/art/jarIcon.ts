import type Phaser from 'phaser';

/** Радуга банки «Радуга» (за неделю заданий подряд) и других радужных значков. */
export const RAINBOW = [0xff9aa2, 0xffc98f, 0xfff08a, 0x9ff0cf, 0x8fd3ff, 0xc3a8ff];

/** Как выглядит маленькая банка на значке: цвет стекла, края и полоски (если есть). */
export interface JarIconLook {
  glass: number;
  edge: number;
  stripes?: readonly number[];
}

/**
 * Маленькая банка для значков (задания, магазин украшений): корпус со скруглённым низом,
 * кромка сверху и блик. size — высота значка.
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
  const stripes = look.stripes ?? [];
  if (stripes.length > 0) {
    // Полоски снизу вверх, внутри стекла.
    const band = (h - size * 0.12) / stripes.length;
    stripes.forEach((color, index) => {
      g.fillStyle(color, 0.9);
      const bottom = index === 0 ? radius.bl : 0;
      g.fillRoundedRect(
        left + size * 0.05,
        top + h - (index + 1) * band - size * 0.05,
        w - size * 0.1,
        band,
        {
          tl: 0,
          tr: 0,
          bl: bottom * 0.8,
          br: bottom * 0.8,
        },
      );
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
