import Phaser from 'phaser';
import type { KeyArt } from '../art/textures';
import type { ButtonHost } from '../ui/Button';
import { COLORS } from '../ui/theme';
import { titleStyle } from '../scenes/titleStyle';
import { Keycap } from './Keycap';
import { Particles } from './Particles';

export interface RevealContent {
  art: KeyArt;
  /** Имя формы на языке игрока. */
  name: string;
  /** «НОВАЯ ФОРМА!» или «ЛЕГЕНДАРНАЯ ФОРМА!». */
  title: string;
  /** Легендарная форма (Пробел): дольше, с лучами и фейерверком, можно пропустить тапом. */
  legendary: boolean;
  /** Подсказка «Нажми, чтобы продолжить» для легендарной формы. */
  hint: string;
  durationMs: number;
}

export type RevealKind = 'form' | 'legendary';

const RAYS = 14;
const FADE_MS = 200;
/** Высота показа (от надписи до подсказки): на низком экране показ уменьшается. */
const STAGE_HEIGHT = { form: 520, legendary: 600 } as const;
/** Легендарную форму нельзя пропустить случайным тапом в первые доли секунды. */
const SKIP_AFTER_MS = 500;
const RAINBOW = [0xff9aa2, 0xffc98f, 0xfff08a, 0x9ff0cf, 0x8fd3ff, 0xc3a8ff];

/**
 * Показ новой формы (диздок, раздел 9): форма увеличивается в центре, надпись «НОВАЯ ФОРМА!»,
 * имя и конфетти. Пока идёт показ, сцена держит физику. Для Пробела — «ЛЕГЕНДАРНАЯ ФОРМА!»
 * на 3 с с лучами и фейерверком, которую можно пропустить тапом.
 */
export class FormReveal {
  readonly layer: Phaser.GameObjects.Container;
  private readonly scene: ButtonHost;
  private readonly reducedMotion: boolean;
  private readonly shade: Phaser.GameObjects.Rectangle;
  /** Всё, кроме затемнения: центр — центр показа, масштаб — под высоту экрана. */
  private readonly stage: Phaser.GameObjects.Container;
  private readonly rays: Phaser.GameObjects.Graphics;
  private readonly glow: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.Text;
  private readonly name: Phaser.GameObjects.Text;
  private readonly hint: Phaser.GameObjects.Text;
  private readonly fx: Particles;
  private key: Keycap | null = null;
  private content: RevealContent | null = null;
  private onDone: (() => void) | null = null;
  private elapsed = 0;
  private closing = false;
  private timers: Phaser.Time.TimerEvent[] = [];
  private centerY = 600;
  private areaHeight = 1280;

  constructor(scene: ButtonHost, reducedMotion: boolean) {
    this.scene = scene;
    this.reducedMotion = reducedMotion;
    this.shade = new Phaser.GameObjects.Rectangle(scene, 0, 0, 720, 100, COLORS.dim, 0.5);
    this.shade.setOrigin(0, 0);
    // Затемнение ловит нажатия: пока видна новая форма, тап не сбрасывает клавишу.
    this.shade.setInteractive();
    this.shade.disableInteractive();
    this.shade.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.skip());
    this.rays = new Phaser.GameObjects.Graphics(scene);
    this.glow = new Phaser.GameObjects.Graphics(scene);
    this.title = scene.createText(0, 0, '', titleStyle(64), false).setOrigin(0.5);
    this.name = scene
      .createText(
        0,
        0,
        '',
        {
          fontSize: '46px',
          fontStyle: '900',
          color: COLORS.title,
          stroke: '#ffffff',
          strokeThickness: 10,
        },
        false,
      )
      .setOrigin(0.5);
    this.hint = scene
      .createText(
        0,
        0,
        '',
        {
          fontSize: '28px',
          fontStyle: '800',
          color: '#ffffff',
          stroke: '#3a2e6e',
          strokeThickness: 6,
        },
        false,
      )
      .setOrigin(0.5);
    this.fx = new Particles(scene, reducedMotion);
    // Конфетти вылетает из-за формы, чтобы не закрывать ей лицо.
    this.stage = new Phaser.GameObjects.Container(scene, 360, this.centerY, [
      this.rays,
      this.glow,
      this.fx.layer,
      this.title,
      this.name,
      this.hint,
    ]);
    this.layer = scene.add.container(0, 0, [this.shade, this.stage]);
    this.layer.setVisible(false);
  }

  /** Сколько идёт текущий показ (для автотестов). */
  get elapsedMs(): number {
    return this.content ? this.elapsed : 0;
  }

  get kind(): RevealKind | null {
    if (!this.content) return null;
    return this.content.legendary ? 'legendary' : 'form';
  }

  show(content: RevealContent, onDone: () => void): void {
    this.finish();
    this.content = content;
    this.onDone = onDone;
    this.elapsed = 0;
    this.closing = false;
    const { scene } = this;
    const { art, legendary } = content;

    this.key = new Keycap(scene, art, { idle: true, random: Math.random });
    const maxWidth = legendary ? 540 : 320;
    const maxHeight = legendary ? 230 : 210;
    this.key.baseScale = Math.min(
      legendary ? 2.2 : 3,
      maxWidth / art.width,
      maxHeight / art.height,
    );
    this.key.showFace('joy', content.durationMs);
    this.stage.addAt(this.key, 3);

    this.title.setText(content.title).setColor(legendary ? '#ff9f1c' : '#e0457b');
    this.title.setFontSize(legendary ? 58 : 64);
    this.name.setText(content.name);
    this.hint.setText(content.hint).setVisible(false);
    this.drawRays(legendary);
    this.glow.clear();
    this.glow.fillStyle(0xffffff, 0.55);
    this.glow.fillCircle(0, 0, legendary ? 200 : 150);
    this.glow.fillStyle(0xffffff, 0.35);
    this.glow.fillCircle(0, 0, legendary ? 260 : 190);
    this.layer.setVisible(true).setAlpha(1);
    this.shade.setInteractive();
    this.place();

    if (!this.reducedMotion) {
      this.key.pop = 0.25;
      scene.tweens.add({ targets: this.key, pop: 1, duration: 380, ease: 'Back.easeOut' });
      this.title.setScale(0.4);
      scene.tweens.add({
        targets: this.title,
        scale: 1,
        duration: 320,
        delay: 60,
        ease: 'Back.easeOut',
      });
      this.shade.setAlpha(0);
      scene.tweens.add({ targets: this.shade, alpha: 1, duration: 150 });
    }
    this.burst();
    if (legendary) {
      this.timers.push(
        scene.time.addEvent({ delay: 450, repeat: -1, callback: () => this.burst() }),
        scene.time.delayedCall(SKIP_AFTER_MS + 300, () => this.hint.setVisible(true)),
      );
    }
    this.timers.push(scene.time.delayedCall(content.durationMs - FADE_MS, () => this.close()));
  }

  /** Тап по экрану: легендарную форму можно пропустить, обычная дождётся своей секунды. */
  skip(): boolean {
    if (!this.content?.legendary || this.closing || this.elapsed < SKIP_AFTER_MS) return false;
    this.close();
    return true;
  }

  /** Где центр показа и какую область закрывает затемнение (в координатах колонки). */
  layout(area: { x: number; y: number; width: number; height: number }, centerY: number): void {
    this.shade.setPosition(area.x, area.y);
    this.shade.setSize(area.width, area.height);
    if (this.shade.input) this.shade.input.hitArea.setSize(area.width, area.height);
    this.centerY = centerY;
    this.areaHeight = area.height;
    this.place();
  }

  tick(deltaMs: number, timeMs: number): void {
    if (!this.content) return;
    this.elapsed += deltaMs;
    this.key?.tick(deltaMs, timeMs);
    if (!this.reducedMotion)
      this.rays.rotation += (deltaMs / 1000) * (this.content.legendary ? 0.5 : 0.8);
    if (this.hint.visible) this.hint.setAlpha(0.65 + 0.35 * Math.sin(timeMs / 220));
  }

  private place(): void {
    const legendary = this.content?.legendary ?? false;
    const height = STAGE_HEIGHT[legendary ? 'legendary' : 'form'];
    this.stage.setScale(Math.min(1, (this.areaHeight - 40) / height));
    this.stage.setPosition(360, this.centerY);
    this.key?.setPosition(0, 0);
    this.title.setPosition(0, legendary ? -230 : -210);
    this.name.setPosition(0, legendary ? 190 : 170);
    this.hint.setPosition(0, legendary ? 270 : 240);
  }

  private drawRays(legendary: boolean): void {
    const g = this.rays;
    g.clear();
    const radius = legendary ? 620 : 420;
    for (let i = 0; i < RAYS; i += 1) {
      const from = (i / RAYS) * Math.PI * 2;
      const to = from + (Math.PI / RAYS) * 0.9;
      const color = legendary ? RAINBOW[i % RAINBOW.length]! : 0xffffff;
      g.fillStyle(color, legendary ? 0.42 : 0.28);
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(Math.cos(from) * radius, Math.sin(from) * radius);
      g.lineTo(Math.cos(to) * radius, Math.sin(to) * radius);
      g.closePath();
      g.fillPath();
    }
  }

  /** Конфетти вокруг формы; у легендарной — фейерверк в случайных местах. */
  private burst(): void {
    const legendary = this.content?.legendary ?? false;
    const spread = legendary ? 260 : 120;
    const x = (Math.random() - 0.5) * spread * 2;
    const y = (Math.random() - 0.5) * spread;
    if (legendary) this.fx.fireworks(x, y);
    else this.fx.celebrate(0, -40);
  }

  private close(): void {
    if (this.closing || !this.content) return;
    this.closing = true;
    this.clearTimers();
    if (this.reducedMotion) {
      this.finish();
      return;
    }
    this.scene.tweens.add({
      targets: this.layer,
      alpha: 0,
      duration: FADE_MS,
      onComplete: () => this.finish(),
    });
  }

  /** Убрать показ и сообщить сцене, что можно продолжать. */
  private finish(): void {
    this.clearTimers();
    const done = this.onDone;
    this.onDone = null;
    this.content = null;
    this.closing = false;
    this.key?.destroy();
    this.key = null;
    this.layer.setVisible(false).setAlpha(1);
    this.shade.disableInteractive();
    done?.();
  }

  private clearTimers(): void {
    this.timers.forEach((timer) => timer.remove(false));
    this.timers = [];
  }
}
