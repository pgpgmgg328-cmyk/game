import Phaser from 'phaser';
import { UI_ART, type KeyArt } from '../art/textures';
import type { ButtonHost } from '../ui/Button';
import { COLORS } from '../ui/theme';
import { Keycap } from './Keycap';

export type ToastIcon = { kind: 'key'; art: KeyArt } | { kind: 'medal' };

export interface ToastContent {
  icon: ToastIcon;
  /** Верхняя строка: что случилось («Достижение!», «Золотая форма!»). */
  title: string;
  /** Нижняя строка: имя достижения или формы. */
  detail: string;
  /** Награда монетами: «+50» с монеткой. */
  coins?: number;
}

const HEIGHT = 104;
const ICON_BOX = 72;
const PADDING = 20;
const HOLD_MS = 1700;
/** Когда ждут ещё несколько плашек, каждая показывается короче. */
const HOLD_BUSY_MS = 1000;
const MAX_WIDTH = 640;

/**
 * Плашки поверх экрана забега: достижения и золотые формы. Показываются по одной,
 * не ловят нажатия и не останавливают игру. Таймеры сцены — плашки ждут вместе с паузой.
 */
export class Toasts {
  readonly layer: Phaser.GameObjects.Container;
  private readonly scene: ButtonHost;
  private readonly reducedMotion: boolean;
  private readonly queue: ToastContent[] = [];
  private current: Phaser.GameObjects.Container | null = null;
  private currentKey: Keycap | null = null;
  private maxWidth = MAX_WIDTH;

  constructor(scene: ButtonHost, reducedMotion: boolean) {
    this.scene = scene;
    this.reducedMotion = reducedMotion;
    this.layer = scene.add.container(360, 80);
  }

  /** Сколько плашек показывается или ждёт очереди (для автотестов). */
  get pending(): number {
    return this.queue.length + (this.current ? 1 : 0);
  }

  show(content: ToastContent): void {
    this.queue.push(content);
    if (!this.current) this.next();
  }

  /** Центр плашки в координатах колонки; шире maxWidth плашка уменьшается. */
  setAnchor(x: number, y: number, maxWidth = MAX_WIDTH): void {
    this.layer.setPosition(x, y);
    this.maxWidth = maxWidth;
  }

  tick(deltaMs: number, timeMs: number): void {
    this.currentKey?.tick(deltaMs, timeMs);
  }

  private next(): void {
    this.current?.destroy();
    this.current = null;
    this.currentKey = null;
    const content = this.queue.shift();
    if (!content) return;
    const { toast, width } = this.build(content);
    this.current = toast;
    this.layer.add(toast);
    const fit = Math.min(1, this.maxWidth / width);
    toast.setScale(fit);

    const hold = this.queue.length > 0 ? HOLD_BUSY_MS : HOLD_MS;
    const { tweens, time } = this.scene;
    if (this.reducedMotion) {
      time.delayedCall(hold + 300, () => this.next());
      return;
    }
    toast
      .setAlpha(0)
      .setY(-36)
      .setScale(0.9 * fit);
    tweens.add({
      targets: toast,
      alpha: 1,
      y: 0,
      scale: fit,
      duration: 260,
      ease: 'Back.easeOut',
      onComplete: () => {
        time.delayedCall(hold, () => {
          tweens.add({
            targets: toast,
            alpha: 0,
            y: -30,
            duration: 220,
            ease: 'Quad.easeIn',
            onComplete: () => this.next(),
          });
        });
      },
    });
  }

  private build(content: ToastContent): { toast: Phaser.GameObjects.Container; width: number } {
    const { scene } = this;
    const title = scene
      .createText(
        0,
        0,
        content.title,
        { fontSize: '26px', fontStyle: '900', color: '#e0457b' },
        false,
      )
      .setOrigin(0, 0.5);
    const detail = scene
      .createText(
        0,
        0,
        content.detail,
        { fontSize: '32px', fontStyle: '900', color: COLORS.title },
        false,
      )
      .setOrigin(0, 0.5);
    const parts: Phaser.GameObjects.GameObject[] = [];
    let coinsWidth = 0;
    let coinIcon: Phaser.GameObjects.Image | null = null;
    let coinText: Phaser.GameObjects.Text | null = null;
    if (content.coins) {
      coinIcon = new Phaser.GameObjects.Image(scene, 0, 0, UI_ART.coin).setDisplaySize(38, 38);
      coinText = scene
        .createText(
          0,
          0,
          `+${content.coins}`,
          { fontSize: '30px', fontStyle: '900', color: '#b8801f' },
          false,
        )
        .setOrigin(0, 0.5);
      coinsWidth = 16 + 38 + 6 + coinText.width;
    }
    const textWidth = Math.max(title.width, detail.width);
    const width = Math.min(MAX_WIDTH, PADDING * 2 + ICON_BOX + 14 + textWidth + coinsWidth);
    const left = -width / 2;

    const panel = new Phaser.GameObjects.Graphics(scene);
    panel.fillStyle(0x2b2250, 0.12);
    panel.fillRoundedRect(left + 4, -HEIGHT / 2 + 6, width, HEIGHT, HEIGHT / 2);
    panel.fillStyle(0xffffff, 0.96);
    panel.fillRoundedRect(left, -HEIGHT / 2, width, HEIGHT, HEIGHT / 2);
    panel.lineStyle(4, 0xffd24a, 1);
    panel.strokeRoundedRect(left, -HEIGHT / 2, width, HEIGHT, HEIGHT / 2);
    parts.push(panel);

    const iconX = left + PADDING + ICON_BOX / 2;
    if (content.icon.kind === 'key') {
      const { art } = content.icon;
      const key = new Keycap(scene, art, { idle: true, random: Math.random });
      key.baseScale = Math.min(1.2, (ICON_BOX - 6) / Math.max(art.width, art.height));
      key.setPosition(iconX, 0);
      key.tick(0, 0);
      this.currentKey = key;
      parts.push(key);
    } else {
      parts.push(
        new Phaser.GameObjects.Image(scene, iconX, 0, UI_ART.medal).setDisplaySize(64, 64),
      );
    }

    // Длинное имя в узкой плашке уменьшается, чтобы не вылезать за край.
    const textLeft = left + PADDING + ICON_BOX + 14;
    const room = width - (textLeft - left) - PADDING - coinsWidth;
    const fit = Math.min(1, room / textWidth);
    title.setScale(fit).setPosition(textLeft, -20);
    detail.setScale(fit).setPosition(textLeft, 18);
    parts.push(title, detail);
    if (coinIcon && coinText) {
      const coinX = textLeft + textWidth * fit + 16 + 19;
      coinIcon.setPosition(coinX, 0);
      coinText.setPosition(coinX + 25, 0);
      parts.push(coinIcon, coinText);
    }
    return { toast: new Phaser.GameObjects.Container(scene, 0, 0, parts), width };
  }
}
