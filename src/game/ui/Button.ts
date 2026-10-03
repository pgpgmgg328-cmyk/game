import Phaser from 'phaser';
import { COLORS } from './theme';

/** Высота боковой грани клавиши в логических пикселях. */
export const BUTTON_DEPTH = 14;
/** Минимальная высота кнопки: даже на самом узком экране это не меньше 48 CSS-пикселей. */
export const MIN_BUTTON_HEIGHT = 110;

export type ButtonVariant = 'primary' | 'secondary' | 'active';
export type ButtonIcon =
  | 'pause'
  | 'shake'
  | 'remove'
  | 'preview'
  | 'squish'
  | 'golden'
  | 'jar'
  | 'coin'
  | 'play'
  | 'worlds'
  | 'album'
  | 'upgrades'
  | 'shop'
  | 'leaderboard'
  | 'settings'
  | 'shortcut'
  | 'left'
  | 'right'
  | 'lock'
  | 'gift';

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
  private icon: ButtonIcon | null;
  private readonly baseFontSize: number;
  private buttonWidth: number;
  private buttonHeight: number;
  private pressed = false;
  private hovered = false;
  /** Клавиша «залипла» нажатой, как Caps Lock: выбранная вкладка. */
  private latched = false;
  private disabled = false;
  private badge: Phaser.GameObjects.Text | null = null;
  /** В углу значок «▶»: ещё можно получить за рекламу. */
  private adBadge = false;

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

  /** Прямоугольник кнопки в координатах сцены с учётом масштаба и родительских контейнеров. */
  worldRect(): Phaser.Geom.Rectangle {
    const matrix = this.getWorldTransformMatrix();
    const width = this.buttonWidth * Math.abs(matrix.scaleX);
    const height = this.buttonHeight * Math.abs(matrix.scaleY);
    return new Phaser.Geom.Rectangle(matrix.tx - width / 2, matrix.ty - height / 2, width, height);
  }

  /** Прямоугольник кнопки в координатах родителя (например, прокручиваемого списка). */
  localRect(): Phaser.Geom.Rectangle {
    const width = this.buttonWidth * Math.abs(this.scaleX);
    const height = this.buttonHeight * Math.abs(this.scaleY);
    return new Phaser.Geom.Rectangle(this.x - width / 2, this.y - height / 2, width, height);
  }

  /** Отменить нажатие (палец начал листать список): при отпускании кнопка не сработает. */
  cancelPress(): void {
    this.setPressed(false);
  }

  /** Текст на кнопке. */
  get text(): string {
    return this.label?.text ?? this.id;
  }

  setText(value: string): this {
    this.label?.setText(value);
    this.fitLabel();
    // Значок стоит рядом с надписью: после смены текста их надо расставить заново.
    this.redraw();
    return this;
  }

  /** Значок в углу кнопки: заряды «Встряски», процент альбома; null — без значка. */
  setBadge(value: number | string | null): this {
    this.adBadge = false;
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

  /** Значок «▶» в углу вместо числа: ещё можно получить за рекламу. */
  setAdBadge(): this {
    this.adBadge = true;
    this.badge?.setVisible(false);
    this.redraw();
    return this;
  }

  /** Сменить значок (null — без значка). */
  setIcon(icon: ButtonIcon | null): this {
    if (this.icon === icon) return this;
    this.icon = icon;
    this.fitLabel();
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

  /** Выбранная вкладка: клавиша остаётся нажатой и становится мятной. */
  setLatched(latched: boolean): this {
    if (this.latched === latched) return this;
    this.latched = latched;
    this.variant = latched ? 'primary' : this.baseVariant;
    this.label?.setColor(PALETTE[this.variant].text);
    this.redraw();
    return this;
  }

  get isLatched(): boolean {
    return this.latched;
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
    const down = this.pressed || this.latched;
    const top = -this.buttonHeight / 2 + (down ? BUTTON_DEPTH * 0.6 : 0);
    const radius = Math.min(30, faceHeight / 2.5, width / 2.5);
    const colors = PALETTE[this.variant];
    const face = this.hovered && !down ? lighten(colors.face, 0.12) : colors.face;

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
    if (this.adBadge) {
      // Кружок с треугольником «▶»: рисуем сами, в шрифте этого символа может не быть.
      const x = width / 2 - BADGE_RADIUS * 0.55;
      const y = top - BADGE_RADIUS * 0.25;
      g.fillStyle(0x7b61ff, 1);
      g.fillCircle(x, y, BADGE_RADIUS);
      g.lineStyle(4, 0xffffff, 1);
      g.strokeCircle(x, y, BADGE_RADIUS);
      drawIcon(g, 'play', x + 2, y, BADGE_RADIUS * 1.3, 0xffffff);
    } else if (this.badge?.visible) {
      // Кружок для числа, «таблетка» для надписи подлиннее (например, «54%»).
      const badgeWidth = Math.max(BADGE_RADIUS * 2, this.badge.width + 8);
      const x = width / 2 - badgeWidth / 2 + BADGE_RADIUS * 0.45;
      const y = top - BADGE_RADIUS * 0.25;
      g.fillStyle(0xff6f91, 1);
      g.fillRoundedRect(
        x - badgeWidth / 2,
        y - BADGE_RADIUS,
        badgeWidth,
        BADGE_RADIUS * 2,
        BADGE_RADIUS,
      );
      g.lineStyle(4, 0xffffff, 1);
      g.strokeRoundedRect(
        x - badgeWidth / 2,
        y - BADGE_RADIUS,
        badgeWidth,
        BADGE_RADIUS * 2,
        BADGE_RADIUS,
      );
      this.badge.setPosition(x, y);
    }
  }
}

/** Значки кнопок и карточек: рисуются линиями, чтобы быть чёткими на любом экране. size — ширина. */
export function drawIcon(
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
    case 'preview': {
      // Глаз: «видно следующие клавиши».
      const w = s * 0.5;
      const h = s * 0.3;
      const upper = new Phaser.Curves.QuadraticBezier(
        new Phaser.Math.Vector2(x - w, y),
        new Phaser.Math.Vector2(x, y - h * 1.6),
        new Phaser.Math.Vector2(x + w, y),
      );
      const lower = new Phaser.Curves.QuadraticBezier(
        new Phaser.Math.Vector2(x + w, y),
        new Phaser.Math.Vector2(x, y + h * 1.6),
        new Phaser.Math.Vector2(x - w, y),
      );
      g.strokePoints([...upper.getPoints(16), ...lower.getPoints(16)], true, true);
      g.fillCircle(x, y, s * 0.15);
      return;
    }
    case 'squish': {
      // Сплющенная клавиша и «пружинки» над ней.
      const w = s * 0.78;
      const h = s * 0.4;
      g.strokeRoundedRect(x - w / 2, y - h / 2 + s * 0.16, w, h, s * 0.12);
      g.lineBetween(x - s * 0.22, y - s * 0.2, x - s * 0.3, y - s * 0.38);
      g.lineBetween(x, y - s * 0.2, x, y - s * 0.42);
      g.lineBetween(x + s * 0.22, y - s * 0.2, x + s * 0.3, y - s * 0.38);
      return;
    }
    case 'golden': {
      // Клавиша со звёздочкой-искрой.
      const k = s * 0.62;
      g.strokeRoundedRect(x - k / 2 - s * 0.06, y - k / 2 + s * 0.06, k, k, s * 0.12);
      const star: Phaser.Math.Vector2[] = [];
      for (let i = 0; i < 8; i += 1) {
        const r = i % 2 === 0 ? s * 0.24 : s * 0.08;
        const angle = -Math.PI / 2 + (i * Math.PI) / 4;
        star.push(
          new Phaser.Math.Vector2(
            x + s * 0.26 + Math.cos(angle) * r,
            y - s * 0.26 + Math.sin(angle) * r,
          ),
        );
      }
      g.fillPoints(star, true);
      return;
    }
    case 'jar': {
      // Банка и стрелки в стороны: «банка шире».
      const w = s * 0.46;
      const h = s * 0.6;
      g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, s * 0.1);
      const a = s * 0.12;
      for (const side of [-1, 1]) {
        const tip = x + side * s * 0.5;
        const from = x + side * s * 0.3;
        g.lineBetween(from, y, tip, y);
        g.lineBetween(tip, y, tip - side * a, y - a);
        g.lineBetween(tip, y, tip - side * a, y + a);
      }
      return;
    }
    case 'play': {
      // Треугольник «▶».
      const r = s * 0.42;
      g.fillPoints(
        [
          new Phaser.Math.Vector2(x - r * 0.7, y - r),
          new Phaser.Math.Vector2(x + r, y),
          new Phaser.Math.Vector2(x - r * 0.7, y + r),
        ],
        true,
      );
      return;
    }
    case 'worlds': {
      // Планета с кольцом.
      g.strokeCircle(x, y, s * 0.3);
      g.strokeEllipse(x, y + s * 0.02, s * 0.98, s * 0.3);
      g.fillCircle(x - s * 0.1, y - s * 0.12, s * 0.06);
      return;
    }
    case 'album': {
      // Раскрытая книга.
      const w = s * 0.4;
      const h = s * 0.56;
      g.strokeRoundedRect(x - w, y - h / 2, w, h, s * 0.06);
      g.strokeRoundedRect(x, y - h / 2, w, h, s * 0.06);
      g.lineBetween(x - w * 0.7, y - h * 0.18, x - w * 0.3, y - h * 0.18);
      g.lineBetween(x + w * 0.3, y - h * 0.18, x + w * 0.7, y - h * 0.18);
      g.lineBetween(x - w * 0.7, y + h * 0.1, x - w * 0.3, y + h * 0.1);
      g.lineBetween(x + w * 0.3, y + h * 0.1, x + w * 0.7, y + h * 0.1);
      return;
    }
    case 'upgrades': {
      // Толстая стрелка вверх.
      const r = s * 0.42;
      g.fillPoints(
        [
          new Phaser.Math.Vector2(x, y - r),
          new Phaser.Math.Vector2(x + r * 0.85, y),
          new Phaser.Math.Vector2(x + r * 0.35, y),
          new Phaser.Math.Vector2(x + r * 0.35, y + r),
          new Phaser.Math.Vector2(x - r * 0.35, y + r),
          new Phaser.Math.Vector2(x - r * 0.35, y),
          new Phaser.Math.Vector2(x - r * 0.85, y),
        ],
        true,
      );
      return;
    }
    case 'shop': {
      // Пакетик с ручкой.
      const w = s * 0.66;
      const h = s * 0.5;
      g.strokeRoundedRect(x - w / 2, y - h / 2 + s * 0.1, w, h, s * 0.08);
      g.beginPath();
      g.arc(x, y - s * 0.12, s * 0.17, Math.PI, 0);
      g.strokePath();
      return;
    }
    case 'leaderboard': {
      // Корона.
      const w = s * 0.4;
      const top = y - s * 0.3;
      const bottom = y + s * 0.26;
      g.fillPoints(
        [
          new Phaser.Math.Vector2(x - w, bottom),
          new Phaser.Math.Vector2(x - w, top + s * 0.1),
          new Phaser.Math.Vector2(x - w * 0.45, y),
          new Phaser.Math.Vector2(x, top),
          new Phaser.Math.Vector2(x + w * 0.45, y),
          new Phaser.Math.Vector2(x + w, top + s * 0.1),
          new Phaser.Math.Vector2(x + w, bottom),
        ],
        true,
      );
      return;
    }
    case 'settings': {
      // Шестерёнка с дыркой.
      const outer = s * 0.4;
      const inner = s * 0.3;
      const teeth = 8;
      const points: Phaser.Math.Vector2[] = [];
      for (let i = 0; i < teeth * 4; i += 1) {
        const angle = (i / (teeth * 4)) * Math.PI * 2;
        const r = i % 4 < 2 ? outer : inner;
        points.push(new Phaser.Math.Vector2(x + Math.cos(angle) * r, y + Math.sin(angle) * r));
      }
      g.fillPoints(points, true);
      g.lineStyle(Math.max(4, s * 0.1), 0xffffff, 1);
      g.strokeCircle(x, y, s * 0.1);
      return;
    }
    case 'shortcut': {
      // Значок приложения с плюсом: «ярлык на рабочий стол».
      const k = s * 0.7;
      g.strokeRoundedRect(x - k / 2, y - k / 2, k, k, s * 0.18);
      const p = s * 0.18;
      g.lineStyle(Math.max(5, s * 0.12), color, 1);
      g.lineBetween(x - p, y, x + p, y);
      g.lineBetween(x, y - p, x, y + p);
      return;
    }
    case 'coin': {
      // Монетка «клац»: золото не зависит от цвета надписи.
      const r = s * 0.42;
      g.fillStyle(0xffd24a, 1);
      g.fillCircle(x, y, r);
      g.lineStyle(Math.max(3, s * 0.07), 0xa8680f, 1);
      g.strokeCircle(x, y, r);
      g.fillStyle(0xeea52b, 1);
      g.fillRoundedRect(x - r * 0.4, y - r * 0.4, r * 0.8, r * 0.8, r * 0.18);
      g.fillStyle(0xfff4b8, 1);
      g.fillRoundedRect(x - r * 0.3, y - r * 0.36, r * 0.6, r * 0.46, r * 0.12);
      return;
    }
    case 'left':
    case 'right': {
      // Стрелка-треугольник карусели миров.
      const r = s * 0.36;
      const dir = icon === 'left' ? -1 : 1;
      g.fillPoints(
        [
          new Phaser.Math.Vector2(x + dir * r, y),
          new Phaser.Math.Vector2(x - dir * r * 0.6, y - r),
          new Phaser.Math.Vector2(x - dir * r * 0.6, y + r),
        ],
        true,
      );
      return;
    }
    case 'lock': {
      // Замочек: дужка и корпус с замочной скважиной.
      const w = s * 0.56;
      const h = s * 0.42;
      g.lineStyle(Math.max(4, s * 0.1), color, 1);
      g.beginPath();
      g.arc(x, y - h * 0.15, w * 0.32, Math.PI, 0);
      g.strokePath();
      g.lineBetween(x - w * 0.32, y - h * 0.15, x - w * 0.32, y + h * 0.05);
      g.lineBetween(x + w * 0.32, y - h * 0.15, x + w * 0.32, y + h * 0.05);
      g.fillRoundedRect(x - w / 2, y, w, h, s * 0.06);
      return;
    }
    case 'gift': {
      // Подарок: коробка, крышка и бантик.
      const w = s * 0.62;
      const h = s * 0.42;
      g.fillRoundedRect(x - w / 2, y - h * 0.15, w, h, s * 0.05);
      g.fillRoundedRect(x - w * 0.58, y - h * 0.5, w * 1.16, h * 0.3, s * 0.04);
      g.lineStyle(Math.max(3, s * 0.08), color, 1);
      g.strokeEllipse(x - s * 0.1, y - h * 0.68, s * 0.2, s * 0.14);
      g.strokeEllipse(x + s * 0.1, y - h * 0.68, s * 0.2, s * 0.14);
      return;
    }
  }
}
