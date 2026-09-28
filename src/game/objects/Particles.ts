import Phaser from 'phaser';
import { FX } from '../art/textures';
import type { ButtonHost } from '../ui/Button';
import { COLORS } from '../ui/theme';

type Emitter = Phaser.GameObjects.Particles.ParticleEmitter;

/** Сколько надписей «клац!» может висеть одновременно: старые уступают место новым. */
const POPUP_POOL = 6;
const RAINBOW = [0xff9aa2, 0xffc98f, 0xfff08a, 0x9ff0cf, 0x8fd3ff, 0xc3a8ff];

/**
 * Частицы в банке: звёздочки и сердечки при слиянии, фейерверк мега-клаца,
 * всплывающее «клац!» на языке игрока (диздок, раздел 12). Эмиттеры Phaser сами держат пул частиц.
 */
export class Particles {
  readonly layer: Phaser.GameObjects.Container;
  private readonly scene: ButtonHost;
  private readonly reducedMotion: boolean;
  private readonly stars: Emitter;
  private readonly hearts: Emitter;
  private readonly sparkles: Emitter;
  private readonly popups: Phaser.GameObjects.Text[] = [];
  private nextPopup = 0;

  constructor(scene: ButtonHost, reducedMotion: boolean) {
    this.scene = scene;
    this.reducedMotion = reducedMotion;
    this.layer = new Phaser.GameObjects.Container(scene, 0, 0);
    const travel = reducedMotion ? 0.5 : 1;
    const emitter = (
      texture: string,
      config: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig,
    ): Emitter => {
      const created = new Phaser.GameObjects.Particles.ParticleEmitter(scene, 0, 0, texture, {
        emitting: false,
        ...config,
      });
      this.layer.add(created);
      return created;
    };
    this.stars = emitter(FX.star, {
      lifespan: { min: 450, max: 850 },
      speed: { min: 160 * travel, max: 420 * travel },
      angle: { min: 0, max: 360 },
      rotate: { min: -180, max: 180 },
      scale: { start: 0.6, end: 0 },
      gravityY: 520,
    });
    this.hearts = emitter(FX.heart, {
      lifespan: { min: 600, max: 1000 },
      speed: { min: 60 * travel, max: 180 * travel },
      angle: { min: 230, max: 310 },
      scale: { start: 0.5, end: 0.1 },
      alpha: { start: 1, end: 0 },
      gravityY: -60,
    });
    this.sparkles = emitter(FX.sparkle, {
      lifespan: { min: 300, max: 600 },
      speed: { min: 20, max: 90 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.45, end: 0 },
    });

    for (let i = 0; i < POPUP_POOL; i += 1) {
      const text = scene
        .createText(
          0,
          0,
          '',
          {
            fontSize: '36px',
            fontStyle: '900',
            color: COLORS.title,
            stroke: '#ffffff',
            strokeThickness: 8,
            align: 'center',
          },
          false,
        )
        .setOrigin(0.5)
        .setVisible(false);
      this.popups.push(text);
      this.layer.add(text);
    }
  }

  /** Слияние: звёздочки цвета новой клавиши, пара сердечек и «клац!». */
  merge(x: number, y: number, color: number, tier: number, label: string, score: number): void {
    const count = Math.min(26, 8 + tier * 2);
    this.stars.setParticleTint(color);
    this.stars.explode(this.reducedMotion ? Math.ceil(count / 2) : count, x, y);
    this.hearts.setParticleTint(0xff8fb8);
    this.hearts.explode(tier >= 5 ? 3 : 1, x, y - 10);
    this.popup(x, y, `${label}\n+${score}`, 26 + tier * 2.4);
  }

  /** Мега-клац двух Пробелов: радужный фейерверк. */
  mega(x: number, y: number, label: string, score: number): void {
    RAINBOW.forEach((color, index) => {
      this.stars.setParticleTint(color);
      this.stars.explode(this.reducedMotion ? 5 : 10, x + (index - 2.5) * 30, y);
    });
    this.sparkles.setParticleTint(0xffffff);
    this.sparkles.explode(20, x, y);
    this.popup(x, y, `${label}\n+${score}`, 56);
  }

  /** Тап-сквиш: пара искорок. */
  squish(x: number, y: number): void {
    this.sparkles.setParticleTint(0xffffff);
    this.sparkles.explode(4, x, y);
  }

  private popup(x: number, y: number, text: string, size: number): void {
    const popup = this.popups[this.nextPopup]!;
    this.nextPopup = (this.nextPopup + 1) % this.popups.length;
    this.scene.tweens.killTweensOf(popup);
    popup
      .setText(text)
      .setFontSize(Math.round(size))
      .setPosition(x, y)
      .setAlpha(1)
      .setScale(0.7)
      .setVisible(true);
    this.scene.tweens.add({
      targets: popup,
      y: this.reducedMotion ? y : y - 80,
      scale: 1,
      alpha: 0,
      duration: 900,
      ease: 'Cubic.easeOut',
      onComplete: () => popup.setVisible(false),
    });
  }
}
