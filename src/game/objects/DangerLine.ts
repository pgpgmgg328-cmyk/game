import Phaser from 'phaser';
import type { ThemePalette } from '../../themes';
import { hexToNumber } from '../art/color';
import type { JarGeometry } from '../run/Run';

/** Линия опасности: спокойный пунктир, мигает, пока осевшая клавиша выше неё. */
export class DangerLine {
  readonly graphics: Phaser.GameObjects.Graphics;
  private readonly width: number;
  private readonly color: number;
  private warning = false;

  constructor(scene: Phaser.Scene, jar: JarGeometry, palette: ThemePalette) {
    this.graphics = new Phaser.GameObjects.Graphics(scene);
    this.graphics.setY(jar.dangerY);
    this.width = jar.width;
    this.color = hexToNumber(palette.danger);
    this.redraw(0.35, 5);
  }

  setWarning(warning: boolean): void {
    this.warning = warning;
    if (!warning) this.redraw(0.35, 5);
  }

  /** dangerMs — сколько самая «долгая» клавиша уже над линией: мигание ускоряется. */
  tick(timeMs: number, dangerMs: number, reducedMotion: boolean): void {
    if (!this.warning) return;
    if (reducedMotion) {
      this.redraw(0.95, 7);
      return;
    }
    const speed = 5 + (dangerMs / 1000) * 5;
    const wave = 0.5 + 0.5 * Math.sin((timeMs / 1000) * speed * Math.PI);
    this.redraw(0.45 + 0.55 * wave, 6 + wave * 2);
  }

  private redraw(alpha: number, thickness: number): void {
    const g = this.graphics;
    g.clear();
    g.fillStyle(this.color, alpha);
    const dash = 22;
    const gap = 14;
    for (let x = 6; x < this.width - 6; x += dash + gap) {
      g.fillRoundedRect(
        x,
        -thickness / 2,
        Math.min(dash, this.width - 6 - x),
        thickness,
        thickness / 2,
      );
    }
  }
}
