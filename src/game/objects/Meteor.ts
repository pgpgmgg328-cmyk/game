import Phaser from 'phaser';
import { SPECIAL_ART, ensureMeteorArt } from '../art/specialArt';
import { TEXTURE_SCALE } from '../art/textures';

/**
 * «Метеорчик» на экране (мир 3): весёлый камушек с лицом и хвост из искорок. Хвост и лицо
 * не крутятся, вращается только сам камушек — его кратеры показывают, что он катится.
 */
export class MeteorView extends Phaser.GameObjects.Container {
  /** Диаметр в единицах физики. */
  readonly size: number;
  private readonly stone: Phaser.GameObjects.Image;
  private readonly face: Phaser.GameObjects.Image;
  private readonly tail: Phaser.GameObjects.Image;
  private readonly idle: boolean;
  /** Общий масштаб поверх baseScale: для появления и исчезновения. */
  pop = 1;
  /** Постоянный масштаб (маленький «Метеорчик» в превью «Далее»). */
  baseScale = 1;

  constructor(scene: Phaser.Scene, size: number, idle: boolean) {
    super(scene, 0, 0);
    ensureMeteorArt(scene, size);
    this.size = size;
    this.idle = idle;
    const scale = 1 / TEXTURE_SCALE;
    this.tail = new Phaser.GameObjects.Image(scene, 0, 0, SPECIAL_ART.meteorTail)
      .setOrigin(0.5, 1)
      .setScale(scale)
      .setAlpha(0.85);
    this.stone = new Phaser.GameObjects.Image(scene, 0, 0, SPECIAL_ART.meteor).setScale(scale);
    this.face = new Phaser.GameObjects.Image(
      scene,
      0,
      size * 0.06,
      SPECIAL_ART.meteorFace,
      'open',
    ).setScale(scale);
    this.add([this.tail, this.stone, this.face]);
  }

  /** Хвост виден, пока «Метеорчик» летит. */
  setTail(visible: boolean): this {
    this.tail.setVisible(visible);
    return this;
  }

  /** Поворот камушка по телу физики. */
  setSpin(angle: number): this {
    this.stone.setRotation(angle);
    return this;
  }

  tick(_deltaMs: number, timeMs: number): void {
    this.setScale(this.baseScale * this.pop);
    if (this.idle && this.tail.visible) {
      this.tail.setScale((1 / TEXTURE_SCALE) * (1 + Math.sin(timeMs / 70) * 0.06));
    }
  }
}
