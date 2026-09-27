import Phaser from 'phaser';
import { COLORS } from './theme';

/** Высота боковой грани клавиши в логических пикселях. */
export const BUTTON_DEPTH = 14;
/** Минимальная высота кнопки: даже на самом узком экране это не меньше 48 CSS-пикселей. */
export const MIN_BUTTON_HEIGHT = 110;

export type ButtonVariant = 'primary' | 'secondary';
export type ButtonIcon = 'pause';

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
}

const PALETTE: Record<ButtonVariant, { face: number; side: number; text: string }> = {
  primary: { face: COLORS.mint, side: COLORS.mintDark, text: COLORS.mintText },
  secondary: { face: COLORS.keyFace, side: COLORS.keySide, text: COLORS.keyText },
};

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
  private readonly variant: ButtonVariant;
  private readonly icon: ButtonIcon | null;
  private readonly baseFontSize: number;
  private buttonWidth: number;
  private buttonHeight: number;
  private pressed = false;
  private hovered = false;

  constructor(scene: ButtonHost, x: number, y: number, options: ButtonOptions) {
    super(scene, x, y);
    this.id = options.id;
    this.variant = options.variant ?? 'secondary';
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
      if (wasPressed) options.onClick();
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
    if (this.pressed === pressed) return;
    this.pressed = pressed;
    this.redraw();
  }

  /** Длинная надпись уменьшается, чтобы поместиться в кнопку. */
  private fitLabel(): void {
    if (!this.label) return;
    this.label.setFontSize(this.baseFontSize);
    const maxWidth = this.buttonWidth - 40;
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
    this.label?.setPosition(0, centerY);
    if (this.icon === 'pause') {
      const color = Phaser.Display.Color.HexStringToColor(colors.text).color;
      const barWidth = faceHeight * 0.14;
      const barHeight = faceHeight * 0.42;
      g.fillStyle(color, 1);
      g.fillRoundedRect(
        -barWidth * 1.6,
        centerY - barHeight / 2,
        barWidth,
        barHeight,
        barWidth / 3,
      );
      g.fillRoundedRect(barWidth * 0.6, centerY - barHeight / 2, barWidth, barHeight, barWidth / 3);
    }
  }
}
