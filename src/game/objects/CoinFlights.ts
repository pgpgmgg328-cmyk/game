import Phaser from 'phaser';
import { UI_ART } from '../art/textures';

/** Больше монеток одновременно не летает: остальное сразу попадает в счётчик. */
const POOL = 24;
const MAX_PER_LAUNCH = 5;
const FLIGHT_MS = 520;
const STAGGER_MS = 70;
const SIZE = 34;

export interface Point {
  x: number;
  y: number;
}

/**
 * Монетки летят от места слияния к счётчику монет. Каждая несёт свою долю монет:
 * счётчик растёт, когда монетка долетает. Если игрок просил меньше анимации — сразу в счётчик.
 */
export class CoinFlights {
  readonly layer: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private readonly reducedMotion: boolean;
  private readonly free: Phaser.GameObjects.Image[] = [];
  private flying = 0;

  constructor(scene: Phaser.Scene, reducedMotion: boolean) {
    this.scene = scene;
    this.reducedMotion = reducedMotion;
    this.layer = scene.add.container(0, 0);
    for (let i = 0; i < POOL; i += 1) {
      const image = new Phaser.GameObjects.Image(scene, 0, 0, UI_ART.coin)
        .setDisplaySize(SIZE, SIZE)
        .setVisible(false);
      this.free.push(image);
      this.layer.add(image);
    }
  }

  /** Сколько монеток сейчас в полёте (для автотестов). */
  get inFlight(): number {
    return this.flying;
  }

  launch(from: Point, to: Point, amount: number, onArrive: (value: number) => void): void {
    if (amount <= 0) return;
    const count = this.reducedMotion
      ? 0
      : Math.min(MAX_PER_LAUNCH, Math.ceil(amount / 4), this.free.length);
    if (count === 0) {
      onArrive(amount);
      return;
    }
    const share = Math.floor(amount / count);
    for (let i = 0; i < count; i += 1) {
      // Последняя монетка несёт остаток, чтобы сумма сошлась.
      const value = i === count - 1 ? amount - share * (count - 1) : share;
      this.fly(this.free.pop()!, from, to, i, value, onArrive);
    }
  }

  private fly(
    image: Phaser.GameObjects.Image,
    from: Point,
    to: Point,
    index: number,
    value: number,
    onArrive: (value: number) => void,
  ): void {
    this.flying += 1;
    const start = {
      x: from.x + (Math.random() - 0.5) * 50,
      y: from.y + (Math.random() - 0.5) * 30,
    };
    // Монетка сначала подлетает вверх и в сторону, потом по дуге к счётчику.
    const control = {
      x: start.x + (Math.random() - 0.5) * 160,
      y: Math.min(start.y, to.y) - 60 - Math.random() * 80,
    };
    image.setPosition(start.x, start.y).setVisible(true).setAlpha(1).setScale(0);
    const state = { t: 0 };
    this.scene.tweens.add({
      targets: state,
      t: 1,
      delay: index * STAGGER_MS,
      duration: FLIGHT_MS,
      ease: 'Sine.easeIn',
      onUpdate: () => {
        const t = state.t;
        const u = 1 - t;
        image.setPosition(
          u * u * start.x + 2 * u * t * control.x + t * t * to.x,
          u * u * start.y + 2 * u * t * control.y + t * t * to.y,
        );
        const grow = Math.min(1, t * 5);
        image.setDisplaySize(SIZE * grow * (1 - t * 0.25), SIZE * grow * (1 - t * 0.25));
      },
      onComplete: () => {
        image.setVisible(false);
        this.free.push(image);
        this.flying -= 1;
        onArrive(value);
      },
    });
  }
}
