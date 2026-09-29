import Phaser from 'phaser';
import { Button } from './Button';

/** Сдвиг пальца, после которого нажатие считается прокруткой, а не тапом. */
const DRAG_SLOP = 12;
/** Затухание инерции за миллисекунду. */
const FRICTION = 0.0045;
const WHEEL_SPEED = 0.8;

interface DragState {
  pointerId: number;
  startY: number;
  startOffset: number;
  lastY: number;
  lastTime: number;
  moved: boolean;
}

/**
 * Вертикальная прокрутка для длинных экранов (альбом, апгрейды): содержимое листается пальцем,
 * мышью и колесом, с инерцией. Видна только область area, остальное закрыто маской.
 * Кнопки внутри нажимаются, только пока целиком видны; тап без прокрутки уходит в onTap
 * с координатами внутри содержимого.
 */
export class ScrollPanel {
  readonly content: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private readonly maskShape: Phaser.GameObjects.Graphics;
  private readonly bar: Phaser.GameObjects.Graphics;
  private readonly onTap: (x: number, y: number) => void;
  private area = { x: 0, y: 0, width: 720, height: 600 };
  private contentHeight = 0;
  private offset = 0;
  private velocity = 0;
  private drag: DragState | null = null;
  private barAlpha = 0;

  constructor(scene: Phaser.Scene, onTap: (x: number, y: number) => void = () => {}) {
    this.scene = scene;
    this.onTap = onTap;
    this.content = scene.add.container(0, 0);
    this.maskShape = scene.make.graphics({}, false);
    this.content.setMask(this.maskShape.createGeometryMask());
    this.bar = scene.add.graphics();
    this.bindInput();
  }

  /** Сколько прокручено (для автотестов). */
  get scrolled(): number {
    return this.offset;
  }

  get maxOffset(): number {
    return Math.max(0, this.contentHeight - this.area.height);
  }

  /** Видимая область в координатах колонки. */
  setArea(x: number, y: number, width: number, height: number): void {
    this.area = { x, y, width, height };
    this.maskShape.clear();
    this.maskShape.fillStyle(0xffffff, 1);
    this.maskShape.fillRect(x, y, width, height);
    this.apply();
  }

  setContentHeight(height: number): void {
    this.contentHeight = height;
    this.apply();
  }

  scrollTo(offset: number): void {
    this.velocity = 0;
    this.offset = offset;
    this.apply();
  }

  /** Прокрутить так, чтобы полоса content-координат [top, bottom] была видна. */
  reveal(top: number, bottom: number): void {
    if (top < this.offset) this.scrollTo(top - 16);
    else if (bottom > this.offset + this.area.height) this.scrollTo(bottom - this.area.height + 16);
  }

  update(deltaMs: number): void {
    if (!this.drag && Math.abs(this.velocity) > 0.01) {
      this.offset += this.velocity * deltaMs;
      this.velocity *= Math.max(0, 1 - FRICTION * deltaMs);
      this.apply();
    }
    const scrolling = this.drag?.moved === true || Math.abs(this.velocity) > 0.05;
    const target = scrolling ? 1 : 0;
    this.barAlpha += (target - this.barAlpha) * Math.min(1, deltaMs / 150);
    this.drawBar();
  }

  private apply(): void {
    this.offset = Math.max(0, Math.min(this.maxOffset, this.offset));
    this.content.setPosition(this.area.x, this.area.y - this.offset);
    this.updateButtons();
  }

  /** Кнопки под маской не должны нажиматься: нажимается только то, что видно целиком. */
  private updateButtons(): void {
    const top = this.offset;
    const bottom = this.offset + this.area.height;
    this.content.each((child: Phaser.GameObjects.GameObject) => {
      if (!(child instanceof Button) || !child.input) return;
      const rect = child.localRect();
      child.input.enabled = rect.y >= top - 1 && rect.y + rect.height <= bottom + 1;
    });
  }

  private drawBar(): void {
    const g = this.bar;
    g.clear();
    if (this.maxOffset <= 0 || this.barAlpha < 0.02) return;
    const { x, y, width, height } = this.area;
    const length = Math.max(60, (height * height) / this.contentHeight);
    const top = y + ((height - length) * this.offset) / this.maxOffset;
    g.fillStyle(0x3a2e6e, 0.35 * this.barAlpha);
    g.fillRoundedRect(x + width - 12, top, 8, length, 4);
  }

  private inside(pointer: Phaser.Input.Pointer): boolean {
    const { x, y, width, height } = this.area;
    return (
      pointer.worldX >= x &&
      pointer.worldX <= x + width &&
      pointer.worldY >= y &&
      pointer.worldY <= y + height
    );
  }

  private bindInput(): void {
    const { input } = this.scene;
    const { Events } = Phaser.Input;
    input.on(Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      if (this.drag || !this.inside(pointer)) return;
      this.velocity = 0;
      this.drag = {
        pointerId: pointer.id,
        startY: pointer.worldY,
        startOffset: this.offset,
        lastY: pointer.worldY,
        lastTime: this.scene.time.now,
        moved: false,
      };
    });
    input.on(Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
      const drag = this.drag;
      if (!drag || drag.pointerId !== pointer.id) return;
      const dy = pointer.worldY - drag.startY;
      if (!drag.moved && Math.abs(dy) > DRAG_SLOP && this.maxOffset > 0) {
        drag.moved = true;
        // Палец начал листать: кнопка под ним не должна нажаться при отпускании.
        this.content.each((child: Phaser.GameObjects.GameObject) => {
          if (child instanceof Button) child.cancelPress();
        });
      }
      if (!drag.moved) return;
      const now = this.scene.time.now;
      const dt = Math.max(1, now - drag.lastTime);
      this.velocity = -(pointer.worldY - drag.lastY) / dt;
      drag.lastY = pointer.worldY;
      drag.lastTime = now;
      this.offset = drag.startOffset - dy;
      this.apply();
    });
    const release = (pointer: Phaser.Input.Pointer): void => {
      const drag = this.drag;
      if (!drag || drag.pointerId !== pointer.id) return;
      this.drag = null;
      if (!drag.moved && this.inside(pointer)) {
        this.onTap(pointer.worldX - this.area.x, pointer.worldY - this.area.y + this.offset);
      }
    };
    input.on(Events.POINTER_UP, release);
    input.on(Events.POINTER_UP_OUTSIDE, release);
    input.on(
      Events.POINTER_WHEEL,
      (_pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) => {
        this.velocity = 0;
        this.offset += dy * WHEEL_SPEED;
        this.apply();
        this.barAlpha = 1;
      },
    );
  }
}
