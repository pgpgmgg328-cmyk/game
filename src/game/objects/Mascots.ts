import Phaser from 'phaser';
import type { KeyArt } from '../art/textures';
import type { ButtonHost } from '../ui/Button';
import { COLORS } from '../ui/theme';
import { Keycap } from './Keycap';

/** Через сколько без касаний персонажи засыпают (пасхалка) и как часто летят «z». */
export const SLEEP_AFTER_MS = 25_000;
const ZZZ_EVERY_MS = 1300;

interface Mascot {
  art: KeyArt;
  keycap: Keycap;
  x: number;
  y: number;
  hop: number;
  nextHopAt: number;
  nextZAt: number;
}

/**
 * Живые клавиши-персонажи в меню: дышат, моргают, иногда подпрыгивают, пищат от нажатия.
 * Если долго ничего не трогать, засыпают — над ними летят «z», а касание их будит.
 */
export class Mascots {
  readonly layer: Phaser.GameObjects.Container;
  private readonly scene: ButtonHost;
  private readonly reducedMotion: boolean;
  private readonly onSqueak: (tier: number) => void;
  private mascots: Mascot[] = [];
  private sleeping = false;
  private time = 0;

  constructor(
    scene: ButtonHost,
    arts: readonly KeyArt[],
    reducedMotion: boolean,
    onSqueak: (tier: number) => void,
  ) {
    this.scene = scene;
    this.reducedMotion = reducedMotion;
    this.onSqueak = onSqueak;
    this.layer = scene.add.container(0, 0);
    this.mascots = arts.map((art, index) => {
      const keycap = new Keycap(scene, art, { idle: !reducedMotion, random: Math.random });
      keycap.setSize(art.width, art.height);
      keycap.setInteractive({ cursor: 'pointer' });
      const mascot: Mascot = {
        art,
        keycap,
        x: 0,
        y: 0,
        hop: 0,
        nextHopAt: 2500 + index * 1700,
        nextZAt: index * 400,
      };
      keycap.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.poke(mascot));
      this.layer.add(keycap);
      return mascot;
    });
  }

  get asleep(): boolean {
    return this.sleeping;
  }

  get count(): number {
    return this.mascots.length;
  }

  /**
   * Посадить персонажей в точки places (центр низа клавиши) размером не больше
   * maxWidth × maxHeight. Лишние персонажи прячутся.
   */
  layout(places: readonly { x: number; y: number }[], maxWidth: number, maxHeight: number): void {
    this.mascots.forEach((mascot, index) => {
      const place = places[index];
      mascot.keycap.setVisible(place !== undefined);
      if (!place) return;
      const { width, height } = mascot.art;
      mascot.keycap.baseScale = Math.min(1.6, maxHeight / height, maxWidth / width);
      mascot.x = place.x;
      mascot.y = place.y - (height * mascot.keycap.baseScale) / 2;
    });
  }

  tick(deltaMs: number, timeMs: number): void {
    this.time += deltaMs;
    for (const mascot of this.mascots) {
      if (!this.sleeping && !this.reducedMotion && this.time >= mascot.nextHopAt) {
        mascot.nextHopAt = this.time + 3500 + Math.random() * 4000;
        this.hop(mascot);
      }
      if (this.sleeping && this.time >= mascot.nextZAt && mascot.keycap.visible) {
        mascot.nextZAt = this.time + ZZZ_EVERY_MS;
        this.floatZ(mascot);
      }
      mascot.keycap.setPosition(mascot.x, mascot.y - mascot.hop);
      mascot.keycap.tick(deltaMs, timeMs);
    }
  }

  /** Убрать персонажей (сменился мир в карусели меню). */
  destroy(): void {
    this.layer.destroy();
    this.mascots = [];
  }

  /** Пасхалка: персонажи засыпают — глаза закрыты, над головой «z». */
  sleep(): void {
    if (this.sleeping) return;
    this.sleeping = true;
    for (const mascot of this.mascots) {
      mascot.keycap.showFace('blink', Number.MAX_SAFE_INTEGER);
      mascot.nextZAt = this.time + Math.random() * 600;
    }
  }

  /** Проснуться от касания: вздрагивают и радуются. */
  wake(): void {
    if (!this.sleeping) return;
    this.sleeping = false;
    for (const mascot of this.mascots) {
      mascot.keycap.showFace('joy', 700);
      mascot.keycap.squash(-0.5);
      mascot.nextHopAt = this.time + 1500 + Math.random() * 3000;
    }
  }

  private poke(mascot: Mascot): void {
    this.wake();
    mascot.keycap.squash(0.9);
    mascot.keycap.showFace('squish', 280);
    this.onSqueak(mascot.art.tier);
    this.hop(mascot);
  }

  private hop(mascot: Mascot): void {
    if (this.reducedMotion) return;
    const height = 16 + Math.random() * 14;
    this.scene.tweens.killTweensOf(mascot);
    this.scene.tweens.chain({
      targets: mascot,
      tweens: [
        { hop: height, duration: 220, ease: 'Quad.easeOut' },
        {
          hop: 0,
          duration: 200,
          ease: 'Quad.easeIn',
          onComplete: () => mascot.keycap.squash(0.5),
        },
      ],
    });
  }

  private floatZ(mascot: Mascot): void {
    const size = 26 + Math.random() * 10;
    const z = this.scene
      .createText(
        mascot.x + mascot.art.width * mascot.keycap.baseScale * 0.3,
        mascot.y - mascot.art.height * mascot.keycap.baseScale * 0.5,
        'z',
        { fontSize: `${Math.round(size)}px`, fontStyle: '900', color: COLORS.title },
        false,
      )
      .setOrigin(0.5)
      .setAlpha(0);
    this.layer.add(z);
    this.scene.tweens.add({
      targets: z,
      x: z.x + 30,
      y: z.y - 70,
      alpha: { from: 0.9, to: 0 },
      duration: 1800,
      ease: 'Sine.easeOut',
      onComplete: () => z.destroy(),
    });
  }
}
