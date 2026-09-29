import Phaser from 'phaser';
import { COLORS } from './theme';

/** Высота боковой грани клавиши в логических пикселях. */
export const BUTTON_DEPTH = 14;
/** Минимальная высота кнопки: даже на самом узком экране это не меньше 48 CSS-пикселей. */
export const MIN_BUTTON_HEIGHT = 110;

export type ButtonVariant = 'primary' | 'secondary' | 'active';
export type ButtonIcon = 'pause' | 'shake' | 'remove';

export interface ButtonOptions {
  /** Постоянный идентификатор кнопки (для автотестов). */
  id: string;
  label?: string;
  icon?: ButtonIcon;
  width: number;
  height?: number;
  variant?: ButtonVariant;
  fontSize?: number;
  onClick: () => void;
}

/** Сцена, в которой может жить кнопка. */
export interface ButtonHost extends Phaser.Scene {
  createText(
    x: number,
    y: number,
    text: string,
    style: Phaser.Types.GameObjects.Text.TextStyle,
    addToScene?: boolean,
  ): Phaser.GameObjects.Text;
  registerButton(button: Button): void;
  /** Мягкий щелчок при нажатии. */
  playButtonSound(): void;
}

const PALETTE: Record<ButtonVariant, { face: number; side: number; text: string }> = {
  primary: { face: COLORS.mint, side: COLORS.mintDark, text: COLORS.mintText },
  secondary: { face: COLORS.keyFace, side: COLORS.keySide, text: COLORS.keyText },
  /** Включённый режим (например, «Удаление» ждёт выбора клавиши). */
  active: { face: 0xffb3c8, side: 0xe0708f, text: '#5a1a33' },
};

/** Размер значка на кнопке относительно высоты верхней грани. */
const ICON_SIZE = 0.52;
/** Кружок со счётчиком в углу кнопки. */
const BADGE_RADIUS = 24;

function lighten(color: number, amount: number): number {
  const channel = (shift: number) => {
    const value = (color >> shift) & 0xff;
    return Math.round(value + (255 - value) * amount) << shift;
  };
  return channel(16) | channel(8) | channel(0);
}

/** Кнопка в виде клавиши: верхняя грань, боковая грань снизу, при нажатии клавиша «проседает». */
export class Button extends Phaser.GameObjects.Container {
  readonly id: string;
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text | null;
  private variant: ButtonVariant;
  private readonly baseVariant: ButtonVariant;
  private readonly icon: ButtonIcon | null;
  private readonly baseFontSize: number;
  private buttonWidth: number;
  private buttonHeight: number;
  private pressed = false;
  private hovered = false;
  private disabled = false;
  private badge: Phaser.GameObjects.Text | null = null;

  constructor(scene: ButtonHost, x: number, y: number, options: ButtonOptions) {
    super(scene, x, y);
    this.id = options.id;
    this.variant = options.variant ?? 'secondary';
    this.baseVariant = this.variant;
    this.icon = options.icon ?? null;
    this.baseFontSize = options.fontSize ?? 44;
    this.buttonWidth = options.width;
    this.buttonHeight = Math.max(MIN_BUTTON_HEIGHT, options.height ?? MIN_BUTTON_HEIGHT);

    this.graphics = new Phaser.GameObjects.Graphics(scene);
    this.add(this.graphics);
    this.label =
      options.label === undefined
        ? null
        : scene
            .createText(
              0,
              0,
              options.label,
              {
                fontSize: `${this.baseFontSize}px`,
                fontStyle: '800',
                color: PALETTE[this.variant].text,
                align: 'center',
              },
              false,
            )
            .setOrigin(0.5);
    if (this.label) this.add(this.label);

    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.setPressed(true));
    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
      this.hovered = false;
      this.setPressed(false);
    });
    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
      this.hovered = true;
      this.redraw();
    });
    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
      const wasPressed = this.pressed;
      this.setPressed(false);
      if (!wasPressed || this.disabled) return;
      scene.playButtonSound();
      options.onClick();
    });

    scene.add.existing(this);
    scene.registerButton(this);
    this.applySize();
  }

  /** Прямоугольник кнопки в координатах сцены с учётом масштаба (например, пульсации). */
  worldRect(): Phaser.Geom.Rectangle {
    const width = this.buttonWidth * Math.abs(this.scaleX);
    const height = this.buttonHeight * Math.abs(this.scaleY);
    return new Phaser.Geom.Rectangle(this.x - width / 2, this.y - height / 2, width, height);
  }

  /** Текст на кнопке. */
  get text(): string {
    return this.label?.text ?? this.id;
  }

  setText(value: string): this {
    this.label?.setText(value);
    this.fitLabel();
    return this;
  }

  /** Счётчик в углу кнопки (например, заряды «Встряски»); null — без счётчика. */
  setBadge(value: number | null): this {
    if (value === null) {
      this.badge?.setVisible(false);
      this.redraw();
      return this;
    }
    if (!this.badge) {
      const host = this.scene as ButtonHost;
      this.badge = host
        .createText(0, 0, '', { fontSize: '28px', fontStyle: '900', color: '#ffffff' }, false)
        .setOrigin(0.5);
      this.add(this.badge);
    }
    this.badge.setText(String(value)).setVisible(true);
    this.redraw();
    return this;
  }

  /** Недоступная кнопка видна бледной и не нажимается. */
  setDisabled(disabled: boolean): this {
    if (this.disabled === disabled) return this;
    this.disabled = disabled;
    this.setAlpha(disabled ? 0.55 : 1);
    this.redraw();
    return this;
  }

  /** Подсветка включённого режима. */
  setHighlighted(active: boolean): this {
    const variant = active ? 'active' : this.baseVariant;
    if (variant === this.variant) return this;
    this.variant = variant;
    this.label?.setColor(PALETTE[variant].text);
    this.redraw();
    return this;
  }

  get isDisabled(): boolean {
    return this.disabled;
  }

  setButtonSize(width: number, height = this.buttonHeight): this {
    this.buttonWidth = width;
    this.buttonHeight = Math.max(MIN_BUTTON_HEIGHT, height);
    this.applySize();
    return this;
  }

  private applySize(): void {
    this.setSize(this.buttonWidth, this.buttonHeight);
    const hitArea = new Phaser.Geom.Rectangle(0, 0, this.buttonWidth, this.buttonHeight);
    if (this.input) {
      this.input.hitArea = hitArea;
    } else {
      this.setInteractive(hitArea, Phaser.Geom.Rectangle.Contains);
      if (this.input) (this.input as Phaser.Types.Input.InteractiveObject).cursor = 'pointer';
    }
    this.fitLabel();
    this.redraw();
  }

  private setPressed(pressed: boolean): void {
    if (pressed && this.disabled) return;
    if (this.pressed === pressed) return;
    this.pressed = pressed;
    this.redraw();
  }

  /** Место под значок слева от надписи, если на кнопке есть и то и другое. */
  private iconSpace(): number {
    if (!this.icon || !this.label) return 0;
    return (this.buttonHeight - BUTTON_DEPTH) * ICON_SIZE + 12;
  }

  /** Длинная надпись уменьшается, чтобы поместиться в кнопку. */
  private fitLabel(): void {
    if (!this.label) return;
    this.label.setFontSize(this.baseFontSize);
    const maxWidth = this.buttonWidth - 40 - this.iconSpace();
    if (this.label.width > maxWidth) {
      const size = Math.max(24, Math.floor((this.baseFontSize * maxWidth) / this.label.width));
      this.label.setFontSize(size);
    }
  }

  private redraw(): void {
    const g = this.graphics;
    const width = this.buttonWidth;
    const faceHeight = this.buttonHeight - BUTTON_DEPTH;
    const left = -width / 2;
    const top = -this.buttonHeight / 2 + (this.pressed ? BUTTON_DEPTH * 0.6 : 0);
    const radius = Math.min(30, faceHeight / 2.5, width / 2.5);
    const colors = PALETTE[this.variant];
    const face = this.hovered && !this.pressed ? lighten(colors.face, 0.12) : colors.face;

    g.clear();
    g.fillStyle(colors.side, 1);
    g.fillRoundedRect(left, -this.buttonHeight / 2 + BUTTON_DEPTH, width, faceHeight, radius);
    g.fillStyle(face, 1);
    g.fillRoundedRect(left, top, width, faceHeight, radius);
    // Блик на верхней грани, как у пластиковой клавиши.
    g.fillStyle(0xffffff, 0.35);
    g.fillRoundedRect(left + 16, top + 8, width - 32, Math.min(16, faceHeight * 0.14), 8);

    const centerY = top + faceHeight / 2;
    const iconSpace = this.iconSpace();
    // Значок и надпись вместе: значок слева, надпись по центру оставшегося места.
    const labelWidth = this.label?.width ?? 0;
    const groupWidth = iconSpace + labelWidth;
    const iconX = iconSpace > 0 ? -groupWidth / 2 + (iconSpace - 12) / 2 : 0;
    this.label?.setPosition(
      iconSpace > 0 ? -groupWidth / 2 + iconSpace + labelWidth / 2 : 0,
      centerY,
    );
    if (this.icon) {
      const color = Phaser.Display.Color.HexStringToColor(colors.text).color;
      drawIcon(g, this.icon, iconX, centerY, faceHeight * ICON_SIZE, color);
    }
    if (this.badge?.visible) {
      const x = width / 2 - BADGE_RADIUS * 0.55;
      const y = top - BADGE_RADIUS * 0.25;
      g.fillStyle(0xff6f91, 1);
      g.fillCircle(x, y, BADGE_RADIUS);
      g.lineStyle(4, 0xffffff, 1);
      g.strokeCircle(x, y, BADGE_RADIUS);
      this.badge.setPosition(x, y);
    }
  }
}

/** Значки кнопок: рисуются линиями, чтобы быть чёткими на любом экране. size — ширина значка. */
function drawIcon(
  g: Phaser.GameObjects.Graphics,
  icon: ButtonIcon,
  x: number,
  y: number,
  size: number,
  color: number,
): void {
  const s = size;
  g.fillStyle(color, 1);
  g.lineStyle(Math.max(4, s * 0.1), color, 1);
  switch (icon) {
    case 'pause': {
      const barWidth = s * 0.27;
      const barHeight = s * 0.81;
      g.fillRoundedRect(x - barWidth * 1.6, y - barHeight / 2, barWidth, barHeight, barWidth / 3);
      g.fillRoundedRect(x + barWidth * 0.6, y - barHeight / 2, barWidth, barHeight, barWidth / 3);
      return;
    }
    case 'shake': {
      // Банка с двумя клавишами и дуги «тряски» по бокам.
      const w = s * 0.52;
      const h = s * 0.66;
      g.strokeRoundedRect(x - w / 2, y - h / 2 + s * 0.06, w, h, s * 0.1);
      g.fillRoundedRect(
        x - w / 2 - s * 0.05,
        y - h / 2 - s * 0.06,
        w + s * 0.1,
        s * 0.12,
        s * 0.04,
      );
      g.fillRoundedRect(x - w * 0.34, y + s * 0.08, w * 0.3, w * 0.3, s * 0.04);
      g.fillRoundedRect(x + w * 0.02, y - s * 0.02, w * 0.3, w * 0.3, s * 0.04);
      for (const side of [-1, 1]) {
        g.beginPath();
        g.arc(
          x,
          y + s * 0.04,
          s * 0.46,
          Math.PI / 2 - side * (Math.PI / 2) - 0.45,
          Math.PI / 2 - side * (Math.PI / 2) + 0.45,
        );
        g.strokePath();
      }
      return;
    }
    case 'remove': {
      // Клавиша, которую зачёркивает крестик.
      const k = s * 0.7;
      g.strokeRoundedRect(x - k / 2, y - k / 2, k, k, s * 0.14);
      const d = s * 0.2;
      g.lineStyle(Math.max(5, s * 0.13), color, 1);
      g.lineBetween(x - d, y - d, x + d, y + d);
      g.lineBetween(x + d, y - d, x - d, y + d);
      return;
    }
  }
}
