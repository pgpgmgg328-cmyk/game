import Phaser from 'phaser';
import type { ThemePalette } from '../../themes';
import type { JarPattern, JarSkin } from '../../themes/decor';
import { hexToNumber } from '../art/color';
import { RAINBOW, fillCloud, fillStar } from '../art/jarIcon';
import type { JarGeometry } from '../run/Run';

/** Насколько стенки банки выступают над её верхним краем (кромка). */
const RIM = 10;

/**
 * Прозрачная банка с бликами и мягкой тенью (диздок, раздел 12). Рисуется в единицах физики:
 * задняя часть — под клавишами, передние блики — поверх, чтобы клавиши казались «внутри стекла».
 * Украшение банки (themes/decor.ts) меняет цвета стекла и рисует узор на стенках.
 */
export class JarView {
  readonly back: Phaser.GameObjects.Graphics;
  readonly front: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, jar: JarGeometry, palette: ThemePalette, skin: JarSkin) {
    this.back = new Phaser.GameObjects.Graphics(scene);
    this.front = new Phaser.GameObjects.Graphics(scene);
    this.draw(jar, palette, skin);
  }

  private draw(jar: JarGeometry, palette: ThemePalette, skin: JarSkin): void {
    const { width, height, wall } = jar;
    const look = skin.look;
    const edge = hexToNumber(look ? look.edge : palette.glassEdge);
    const glass = hexToNumber(look ? look.glass : palette.glass);
    const bottomRadius = 26;
    const b = this.back;

    // Мягкая тень под банкой.
    b.fillStyle(0x2b2250, 0.1);
    b.fillEllipse(width / 2, height + wall + 10, width + wall * 4, 34);

    // Стенки и дно: «корпус» банки со скруглённым низом.
    // У украшения стенки ярче, а стекло светлее: узор виден, клавиши внутри — как обычно.
    b.fillStyle(edge, look ? 0.7 : 0.55);
    b.fillRoundedRect(-wall, -RIM, width + wall * 2, height + wall + RIM, {
      tl: wall / 2,
      tr: wall / 2,
      bl: bottomRadius + wall / 2,
      br: bottomRadius + wall / 2,
    });
    if (look) this.drawWalls(jar, look.pattern, hexToNumber(look.accent));
    // Стекло внутри: светлее стенок.
    b.fillStyle(glass, look ? 0.72 : 0.55);
    b.fillRoundedRect(0, -RIM, width, height + RIM, { tl: 0, tr: 0, bl: 8, br: 8 });
    // Внутренний край стенок чуть светлее — видна толщина стекла.
    b.lineStyle(3, 0xffffff, 0.7);
    b.lineBetween(1.5, -RIM, 1.5, height - 8);
    b.lineBetween(width - 1.5, -RIM, width - 1.5, height - 8);
    // Кромки сверху.
    b.fillStyle(look?.pattern === 'rainbow' ? RAINBOW[5]! : edge, 0.9);
    b.fillRoundedRect(-wall - 4, -RIM - 8, wall + 8, 16, 8);
    b.fillStyle(look?.pattern === 'rainbow' ? RAINBOW[0]! : edge, 0.9);
    b.fillRoundedRect(width - 4, -RIM - 8, wall + 8, 16, 8);

    // Блики поверх клавиш: длинный слева, короткие справа.
    const f = this.front;
    f.fillStyle(0xffffff, 0.35);
    f.fillRoundedRect(14, 30, 12, height * 0.55, 6);
    f.fillStyle(0xffffff, 0.22);
    f.fillRoundedRect(34, 44, 6, height * 0.3, 3);
    f.fillStyle(0xffffff, 0.25);
    f.fillRoundedRect(width - 30, height * 0.52, 10, height * 0.3, 5);
    // Блик на стенке слева.
    f.fillStyle(0xffffff, 0.5);
    f.fillRoundedRect(-wall + 5, 10, 6, height * 0.7, 3);
  }

  /** Узор украшения на стенках и дне: радуга, полоски леденца, звёздочки или облачка. */
  private drawWalls(jar: JarGeometry, pattern: JarPattern, accent: number): void {
    const { width, height, wall } = jar;
    const b = this.back;
    const walls = [-wall, width];
    switch (pattern) {
      case 'rainbow': {
        const band = (height + RIM) / RAINBOW.length;
        RAINBOW.forEach((color, index) => {
          b.fillStyle(color, 0.9);
          for (const x of walls) b.fillRect(x + 3, -RIM + index * band, wall - 6, band + 0.5);
          b.fillRect(
            (width / RAINBOW.length) * index,
            height + 3,
            width / RAINBOW.length + 0.5,
            wall - 8,
          );
        });
        return;
      }
      case 'stripes': {
        // Наклонные полоски леденца: параллелограммы ровно по ширине стенки.
        b.fillStyle(accent, 0.9);
        const step = 44;
        for (const x of walls) {
          for (let y = -RIM; y < height - 20; y += step) {
            b.fillPoints(
              [
                new Phaser.Math.Vector2(x, y + 18),
                new Phaser.Math.Vector2(x + wall, y),
                new Phaser.Math.Vector2(x + wall, y + 16),
                new Phaser.Math.Vector2(x, y + 34),
              ],
              true,
            );
          }
        }
        for (let x = 10; x < width - 20; x += step) {
          b.fillPoints(
            [
              new Phaser.Math.Vector2(x, height + wall - 4),
              new Phaser.Math.Vector2(x + 18, height + 2),
              new Phaser.Math.Vector2(x + 34, height + 2),
              new Phaser.Math.Vector2(x + 16, height + wall - 4),
            ],
            true,
          );
        }
        return;
      }
      case 'stars': {
        b.fillStyle(accent, 1);
        for (const x of walls) {
          for (let y = 30; y < height - 20; y += 95) fillStar(b, x + wall / 2, y, 8);
        }
        for (let x = 80; x < width - 40; x += 140) fillStar(b, x, height + wall / 2, 7);
        return;
      }
      case 'clouds': {
        // Облачка вдоль стенок и по дну.
        b.fillStyle(accent, 0.95);
        for (const x of walls) {
          for (let y = 40; y < height - 30; y += 120) fillCloud(b, x + wall / 2, y + 4, 26);
        }
        for (let x = 50; x < width - 40; x += 90) fillCloud(b, x, height + wall / 2, 34);
        return;
      }
    }
  }
}

/** Пунктир прицела от висящей клавиши вниз, до того, на что она упадёт. */
export class AimGuide {
  readonly graphics: Phaser.GameObjects.Graphics;
  private readonly color: number;

  constructor(scene: Phaser.Scene, palette: ThemePalette) {
    this.graphics = new Phaser.GameObjects.Graphics(scene);
    this.color = hexToNumber(palette.guide);
  }

  draw(x: number, fromY: number, toY: number, visible: boolean): void {
    const g = this.graphics;
    g.clear();
    if (!visible || toY - fromY < 20) return;
    g.fillStyle(this.color, 0.3);
    for (let y = fromY + 10; y < toY - 4; y += 24) g.fillCircle(x, y, 3.5);
  }
}
