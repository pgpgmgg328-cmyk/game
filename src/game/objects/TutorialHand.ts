import Phaser from 'phaser';
import { HAND_ART, UI_ART, type KeyArt } from '../art/textures';
import { Keycap } from './Keycap';

/** Какую подсказку показывает рука. */
export type HintKind = 'drag' | 'tap';

/** Ширина руки в единицах физики банки (текстура шире самой перчатки). */
const HAND_WIDTH = 150;
/** «Веди → отпусти»: появление, нажатие, ведение, отпускание, падение, пауза до повтора. */
const DRAG = {
  appear: 250,
  press: 400,
  drag: 1150,
  release: 1300,
  fall: 1750,
  loop: 2300,
} as const;
/** «Тап-тап» по клавише: два нажатия, потом рука исчезает. */
const TAP = { appear: 250, press1: 360, press2: 680, fade: 1100, end: 1400 } as const;
const PRESS_MS = 120;

interface DragPlan {
  art: KeyArt;
  fromX: number;
  toX: number;
  y: number;
  /** Куда «упадёт» призрачная клавиша. */
  fallY: number;
}

interface TapPlan {
  x: number;
  y: number;
  onPress: () => void;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/**
 * Обучение без текста (диздок, раздел 9): анимированная рука показывает «веди → отпусти»
 * с полупрозрачной клавишей, а позже — «тап-тап» по клавише в банке. Живёт в слое банки,
 * координаты — единицы физики. Анимация идёт от tick(), поэтому стоит вместе с паузой сцены.
 */
export class TutorialHand {
  readonly layer: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private readonly hand: Phaser.GameObjects.Image;
  private readonly ripple: Phaser.GameObjects.Graphics;
  private readonly baseScale: number;
  private ghost: Keycap | null = null;
  private drag: DragPlan | null = null;
  private tap: TapPlan | null = null;
  private time = 0;
  private pressed = { first: false, second: false };

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.hand = new Phaser.GameObjects.Image(scene, 0, 0, UI_ART.hand).setOrigin(
      HAND_ART.tipX,
      HAND_ART.tipY,
    );
    this.baseScale = HAND_WIDTH / HAND_ART.width;
    this.hand.setScale(this.baseScale);
    this.ripple = new Phaser.GameObjects.Graphics(scene);
    this.layer = new Phaser.GameObjects.Container(scene, 0, 0, [this.ripple, this.hand]);
    this.layer.setVisible(false);
  }

  /** Что показывает рука сейчас (для автотестов и логики сцены). */
  get kind(): HintKind | null {
    if (this.drag) return 'drag';
    if (this.tap) return 'tap';
    return null;
  }

  /** «Веди → отпусти»: из точки висящей клавиши к цели, клавиша-призрак падает туда. */
  showDrag(plan: DragPlan): void {
    const same =
      this.drag &&
      this.drag.art === plan.art &&
      Math.abs(this.drag.fromX - plan.fromX) < 1 &&
      Math.abs(this.drag.toX - plan.toX) < 1;
    if (same) return;
    this.clear();
    this.drag = plan;
    this.ghost = new Keycap(this.scene, plan.art, { idle: false, random: Math.random });
    this.ghost.setAlpha(0);
    this.ghost.tick(0, 0);
    this.layer.addAt(this.ghost, 0);
    this.time = 0;
    this.layer.setVisible(true);
    this.render();
  }

  /** «Тап-тап» по клавише: onPress вызывается в момент каждого нажатия. */
  showTap(plan: TapPlan): void {
    this.clear();
    this.tap = plan;
    this.time = 0;
    this.pressed = { first: false, second: false };
    this.layer.setVisible(true);
    this.render();
  }

  hide(): void {
    this.clear();
    this.layer.setVisible(false);
  }

  tick(deltaMs: number): void {
    if (!this.drag && !this.tap) return;
    this.time += deltaMs;
    if (this.drag) this.time %= DRAG.loop;
    if (this.tap) {
      if (!this.pressed.first && this.time >= TAP.press1) {
        this.pressed.first = true;
        this.tap.onPress();
      }
      if (!this.pressed.second && this.time >= TAP.press2) {
        this.pressed.second = true;
        this.tap.onPress();
      }
      if (this.time >= TAP.end) {
        this.hide();
        return;
      }
    }
    this.render();
  }

  private clear(): void {
    this.ghost?.destroy();
    this.ghost = null;
    this.drag = null;
    this.tap = null;
    this.ripple.clear();
  }

  private render(): void {
    if (this.drag) this.renderDrag(this.drag);
    else if (this.tap) this.renderTap(this.tap);
  }

  private renderDrag(plan: DragPlan): void {
    const t = this.time;
    const appear = clamp01(t / DRAG.appear);
    const pressed = t >= DRAG.appear && t < DRAG.release;
    const move = easeInOut(clamp01((t - DRAG.press) / (DRAG.drag - DRAG.press)));
    const x = plan.fromX + (plan.toX - plan.fromX) * move;
    const lift = t >= DRAG.release ? clamp01((t - DRAG.release) / 150) * 18 : 0;
    const fade = 1 - clamp01((t - (DRAG.fall - 250)) / 250);
    this.hand.setPosition(x, plan.y + (1 - appear) * 36 - lift);
    this.hand.setAlpha(appear * fade);
    this.hand.setScale(this.baseScale * (pressed ? 0.86 : 1));

    const ghost = this.ghost;
    if (ghost) {
      const falling = clamp01((t - DRAG.release) / (DRAG.fall - DRAG.release));
      const visible = t >= DRAG.appear && t < DRAG.fall;
      ghost.setPosition(x, plan.y + (plan.fallY - plan.y) * falling * falling);
      ghost.setAlpha(visible ? 0.55 * (1 - falling * 0.7) : 0);
    }
    this.drawRipple(plan.fromX, plan.y, t - DRAG.appear);
  }

  private renderTap(plan: TapPlan): void {
    const t = this.time;
    const appear = clamp01(t / TAP.appear);
    const fade = 1 - clamp01((t - TAP.fade) / (TAP.end - TAP.fade));
    const down =
      (t >= TAP.press1 - PRESS_MS / 2 && t < TAP.press1 + PRESS_MS / 2) ||
      (t >= TAP.press2 - PRESS_MS / 2 && t < TAP.press2 + PRESS_MS / 2);
    this.hand.setPosition(plan.x, plan.y + (1 - appear) * 40 + (down ? 6 : 0));
    this.hand.setAlpha(appear * fade);
    this.hand.setScale(this.baseScale * (down ? 0.86 : 1));
    const since = t >= TAP.press2 ? t - TAP.press2 : t - TAP.press1;
    this.drawRipple(plan.x, plan.y, since);
  }

  /** Круги от нажатия пальца. */
  private drawRipple(x: number, y: number, since: number): void {
    this.ripple.clear();
    if (since < 0 || since > 500) return;
    const progress = since / 500;
    this.ripple.lineStyle(5, 0xffffff, 0.9 * (1 - progress));
    this.ripple.strokeCircle(x, y, 10 + progress * 34);
  }
}
