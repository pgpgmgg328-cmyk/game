import Phaser from 'phaser';
import type { ThemePalette } from '../../themes';
import { hexToNumber } from '../art/color';
import type { JarGeometry } from '../run/Run';

/** Насколько стенки банки выступают над её верхним краем (кромка). */
const RIM = 10;

/**
 * Прозрачная банка с бликами и мягкой тенью (диздок, раздел 12). Рисуется в единицах физики:
 * задняя часть — под клавишами, передние блики — поверх, чтобы клавиши казались «внутри стекла».
 */
export class JarView {
  readonly back: Phaser.GameObjects.Graphics;
  readonly front: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, jar: JarGeometry, palette: ThemePalette) {
    this.back = new Phaser.GameObjects.Graphics(scene);
    this.front = new Phaser.GameObjects.Graphics(scene);
    this.draw(jar, palette);
  }

  private draw(jar: JarGeometry, palette: ThemePalette): void {
    const { width, height, wall } = jar;
    const edge = hexToNumber(palette.glassEdge);
    const glass = hexToNumber(palette.glass);
    const bottomRadius = 26;
    const b = this.back;

    // Мягкая тень под банкой.
    b.fillStyle(0x2b2250, 0.1);
    b.fillEllipse(width / 2, height + wall + 10, width + wall * 4, 34);

    // Стенки и дно: «корпус» банки со скруглённым низом.
    b.fillStyle(edge, 0.55);
    b.fillRoundedRect(-wall, -RIM, width + wall * 2, height + wall + RIM, {
      tl: wall / 2,
      tr: wall / 2,
      bl: bottomRadius + wall / 2,
      br: bottomRadius + wall / 2,
    });
    // Стекло внутри: светлее стенок.
    b.fillStyle(glass, 0.55);
    b.fillRoundedRect(0, -RIM, width, height + RIM, { tl: 0, tr: 0, bl: 8, br: 8 });
    // Внутренний край стенок чуть светлее — видна толщина стекла.
    b.lineStyle(3, 0xffffff, 0.7);
    b.lineBetween(1.5, -RIM, 1.5, height - 8);
    b.lineBetween(width - 1.5, -RIM, width - 1.5, height - 8);
    // Кромки сверху.
    b.fillStyle(edge, 0.9);
    b.fillRoundedRect(-wall - 4, -RIM - 8, wall + 8, 16, 8);
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
