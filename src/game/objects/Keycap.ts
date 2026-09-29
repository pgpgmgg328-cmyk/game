import Phaser from 'phaser';
import type { FaceFrame } from '../art/faceArt';
import { FX, TEXTURE_SCALE, type KeyArt } from '../art/textures';

/** Пружинка сплющивания: жёсткость и затухание (1/с² и 1/с). */
const SPRING_STIFFNESS = 380;
const SPRING_DAMPING = 13;
/** Сильнее этого клавиша не сплющивается даже от сильного удара. */
const MAX_SQUASH = 0.3;
/** Дыхание в покое: амплитуда и период. */
const BREATH_AMOUNT = 0.014;
const BREATH_PERIOD_MS = 2600;
/** Моргание раз в 3–6 с (диздок, раздел 4). */
const BLINK_MIN_MS = 3000;
const BLINK_MAX_MS = 6000;
const BLINK_MS = 130;
/** Искорки золотой клавиши: сколько их и как долго горит одна. */
const GLINTS = 2;
const GLINT_MS = 700;
const GLINT_PAUSE_MS = 900;

interface Glint {
  image: Phaser.GameObjects.Image;
  /** Сколько осталось до следующей вспышки (меньше нуля — вспышка идёт). */
  wait: number;
  /** Прошло от начала вспышки. */
  age: number;
}

export interface KeycapOptions {
  /** Дыхание и моргание. Выключены, если игрок просил меньше анимации. */
  idle: boolean;
  /** Источник случайности для фазы дыхания и моргания. */
  random: () => number;
}

/**
 * Клавиша на экране: колпачок и лицо. Сплющивается и растягивается с сохранением площади,
 * в покое дышит и моргает — клавиши должны казаться живыми (диздок, раздел 4).
 * Положение и поворот задаёт сцена по телу физики.
 */
export class Keycap extends Phaser.GameObjects.Container {
  readonly art: KeyArt;
  private readonly face: Phaser.GameObjects.Image;
  private readonly idle: boolean;
  private readonly random: () => number;
  private readonly breathPhase: number;
  private squashValue = 0;
  private squashSpeed = 0;
  private blinkIn: number;
  private frameHold = 0;
  private heldFrame: FaceFrame = 'open';
  private readonly glints: Glint[] = [];
  /** Общий масштаб поверх сплющивания: для появления и исчезновения. */
  pop = 1;
  /** Постоянный масштаб (например, маленькая клавиша в превью «Далее»). */
  baseScale = 1;

  constructor(scene: Phaser.Scene, art: KeyArt, options: KeycapOptions) {
    super(scene, 0, 0);
    this.art = art;
    this.idle = options.idle;
    this.random = options.random;
    this.breathPhase = this.random() * Math.PI * 2;
    this.blinkIn = this.nextBlinkDelay();

    const base = new Phaser.GameObjects.Image(scene, 0, 0, art.key).setScale(1 / TEXTURE_SCALE);
    this.face = new Phaser.GameObjects.Image(
      scene,
      art.faceLayout.offsetX,
      art.faceLayout.offsetY,
      art.face,
      'open',
    ).setScale(1 / TEXTURE_SCALE);
    this.add([base, this.face]);
    if (art.golden) this.createGlints(scene);
  }

  /** Удар или тап: amount 0…1 — насколько сильно сплющить. Отрицательный — вытянуть. */
  squash(amount: number): void {
    this.squashSpeed += Math.max(-1, Math.min(1, amount)) * 7;
  }

  /** Сразу успокоить пружинку (для воспроизводимых скриншотов). */
  settle(): void {
    this.squashValue = 0;
    this.squashSpeed = 0;
  }

  /** Показать особое лицо (например, «сплющилось») на время. */
  showFace(frame: FaceFrame, ms: number): void {
    this.heldFrame = frame;
    this.frameHold = ms;
    this.face.setFrame(frame);
  }

  /** Анимация за кадр. */
  tick(deltaMs: number, timeMs: number): void {
    const dt = Math.min(0.05, deltaMs / 1000);
    const accel = -SPRING_STIFFNESS * this.squashValue - SPRING_DAMPING * this.squashSpeed;
    this.squashSpeed += accel * dt;
    this.squashValue = Math.max(
      -MAX_SQUASH,
      Math.min(MAX_SQUASH, this.squashValue + this.squashSpeed * dt),
    );

    let stretchY = 1 - this.squashValue;
    if (this.idle) {
      stretchY *=
        1 + BREATH_AMOUNT * Math.sin((timeMs / BREATH_PERIOD_MS) * Math.PI * 2 + this.breathPhase);
    }
    // Площадь сохраняется: насколько сплющилась по высоте, настолько расплылась в ширину.
    const scale = this.baseScale * this.pop;
    this.setScale(scale / stretchY, scale * stretchY);
    this.updateFace(deltaMs);
    if (this.idle) this.glints.forEach((glint) => this.updateGlint(glint, deltaMs));
  }

  /** Золотая клавиша блестит: искорки по очереди вспыхивают в случайных местах (диздок, раздел 3). */
  private createGlints(scene: Phaser.Scene): void {
    for (let i = 0; i < GLINTS; i += 1) {
      const image = new Phaser.GameObjects.Image(scene, 0, 0, FX.sparkle).setTint(0xfff3b0);
      const glint: Glint = { image, wait: i * (GLINT_PAUSE_MS / 2) + this.random() * 300, age: 0 };
      this.placeGlint(glint);
      // Без анимации (меньше движения) искорки просто светятся.
      image.setAlpha(this.idle ? 0 : 0.9).setScale(this.idle ? 0 : this.glintScale() * 0.8);
      this.glints.push(glint);
      this.add(image);
    }
  }

  private glintScale(): number {
    return Math.min(0.55, Math.max(0.3, Math.min(this.art.width, this.art.height) / 110));
  }

  private placeGlint(glint: Glint): void {
    const x = (this.random() - 0.5) * this.art.width * 0.8;
    const y = (this.random() - 0.5) * this.art.height * 0.6 - this.art.height * 0.08;
    glint.image.setPosition(x, y);
  }

  private updateGlint(glint: Glint, deltaMs: number): void {
    if (glint.wait > 0) {
      glint.wait -= deltaMs;
      return;
    }
    glint.age += deltaMs;
    const progress = Math.min(1, glint.age / GLINT_MS);
    const flash = Math.sin(progress * Math.PI);
    glint.image.setAlpha(flash).setScale(this.glintScale() * flash);
    glint.image.setRotation(progress * 1.2);
    if (progress >= 1) {
      glint.age = 0;
      glint.wait = GLINT_PAUSE_MS * (0.6 + this.random() * 0.8);
      this.placeGlint(glint);
    }
  }

  private updateFace(deltaMs: number): void {
    if (this.frameHold > 0) {
      this.frameHold -= deltaMs;
      if (this.frameHold <= 0) this.face.setFrame('open');
      return;
    }
    if (!this.idle) return;
    this.blinkIn -= deltaMs;
    if (this.blinkIn <= 0) {
      this.showFace('blink', BLINK_MS);
      this.blinkIn = this.nextBlinkDelay();
    }
  }

  private nextBlinkDelay(): number {
    return BLINK_MIN_MS + this.random() * (BLINK_MAX_MS - BLINK_MIN_MS);
  }

  /** Текущий кадр лица (для автотестов). */
  get faceFrame(): FaceFrame {
    return this.frameHold > 0 ? this.heldFrame : 'open';
  }
}
