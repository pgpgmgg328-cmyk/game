import Phaser from 'phaser';
import type { Layout } from '../../core/layout';
import { DEFAULT_THEME_ID, getTheme, THEMES, type ThemeData } from '../../themes';
import {
  FLOATING_TILE,
  PATTERN_TILE,
  drawFloatingKeys,
  drawKeyboardPattern,
} from '../art/backgroundArt';
import { LAYOUT_EVENT, getContext } from '../context';
import { COLORS } from '../ui/theme';

/** Дальний слой — мелкая клавиатура, едва заметная; ближний — редкие парящие клавиши. */
const KEYBOARD = { scale: 0.5, alpha: 0.22 } as const;
const FLOATING = { scale: 1, alpha: 0.5, speed: 12, parallax: 56 } as const;
const STATIC_KEY = 'bg-static';

/**
 * Фон на весь экран (диздок, раздел 12): мягкий градиент мира с едва заметной клавиатурой
 * и парящие клавиши поверх, которые медленно плывут и чуть сдвигаются за пальцем или мышью
 * (лёгкий параллакс: дальний слой стоит, ближний движется). Градиент и клавиатура рисуются
 * один раз в одну картинку — на каждый кадр остаётся два полноэкранных слоя, а при «уменьшить
 * движение» — один. Под игровой колонкой — светлая подложка; в альбомной ориентации и на
 * десктопе по бокам виден фон, а не чёрная заливка (CLAUDE.md).
 */
export class BackgroundScene extends Phaser.Scene {
  private backdrop!: Phaser.GameObjects.Image;
  private floating: Phaser.GameObjects.TileSprite | null = null;
  private panel!: Phaser.GameObjects.Graphics;
  private theme: ThemeData = THEMES[0]!;
  private layout: Layout | null = null;
  private drift = 0;
  private parallax = { x: 0, y: 0 };
  private reducedMotion = false;

  constructor() {
    super('Background');
  }

  create(): void {
    const ctx = getContext(this.game);
    this.reducedMotion = ctx.reducedMotion;
    this.theme = getTheme(DEFAULT_THEME_ID) ?? THEMES[0]!;
    this.backdrop = this.add.image(0, 0, '__DEFAULT').setOrigin(0, 0);
    if (!this.reducedMotion) {
      this.floating = this.add
        .tileSprite(0, 0, 16, 16, this.floatingKey(this.theme))
        .setOrigin(0, 0)
        .setAlpha(FLOATING.alpha);
      this.ensureFloating(this.theme);
      this.floating.setTexture(this.floatingKey(this.theme));
    }
    this.panel = this.add.graphics();
    this.cameras.main.setOrigin(0, 0);

    const onLayout = (layout: Layout): void => this.applyLayout(layout);
    this.game.events.on(LAYOUT_EVENT, onLayout);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
      this.game.events.off(LAYOUT_EVENT, onLayout),
    );
    this.applyLayout(ctx.layout);
  }

  override update(_time: number, delta: number): void {
    const tile = this.floating;
    const layout = this.layout;
    if (!tile || !layout) return;
    this.drift += delta / 1000;
    const pointer = this.game.input.activePointer;
    const targetX = layout.canvasWidth > 0 ? pointer.x / layout.canvasWidth - 0.5 : 0;
    const targetY = layout.canvasHeight > 0 ? pointer.y / layout.canvasHeight - 0.5 : 0;
    const ease = Math.min(1, delta / 400);
    this.parallax.x += (targetX - this.parallax.x) * ease;
    this.parallax.y += (targetY - this.parallax.y) * ease;
    tile.tilePositionX = this.drift * FLOATING.speed + this.parallax.x * FLOATING.parallax;
    tile.tilePositionY = this.drift * FLOATING.speed * 0.35 + this.parallax.y * FLOATING.parallax;
  }

  /** Фон мира: градиент и узоры в его цветах. */
  setTheme(theme: ThemeData): void {
    if (theme === this.theme || !this.backdrop) return;
    this.theme = theme;
    if (this.floating) {
      this.ensureFloating(theme);
      this.floating.setTexture(this.floatingKey(theme));
    }
    if (this.layout) this.applyLayout(this.layout);
  }

  private floatingKey(theme: ThemeData): string {
    return `bg-floating:${theme.id}`;
  }

  private ensureFloating(theme: ThemeData): void {
    const key = this.floatingKey(theme);
    if (this.textures.exists(key)) return;
    const texture = this.textures.createCanvas(key, FLOATING_TILE.width, FLOATING_TILE.height);
    if (!texture) return;
    drawFloatingKeys(texture.getContext(), theme.palette);
    texture.refresh();
  }

  /**
   * Неподвижная часть фона одной картинкой в CSS-пикселях экрана: градиент, клавиатура и
   * (если движение выключено) парящие клавиши. Перерисовывается только при смене размера или мира.
   */
  private drawBackdrop(layout: Layout): void {
    const width = Math.max(1, Math.ceil(layout.canvasWidth / layout.dpr));
    const height = Math.max(1, Math.ceil(layout.canvasHeight / layout.dpr));
    let texture = this.textures.get(STATIC_KEY) as Phaser.Textures.CanvasTexture;
    if (!this.textures.exists(STATIC_KEY)) {
      const created = this.textures.createCanvas(STATIC_KEY, width, height);
      if (!created) return;
      texture = created;
    } else if (texture.width !== width || texture.height !== height) {
      texture.setSize(width, height);
    }
    const ctx = texture.getContext();
    const { palette } = this.theme;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, palette.skyTop);
    gradient.addColorStop(1, palette.skyBottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    // Узор в логических пикселях колонки: на телефоне и на мониторе клавиши одного размера.
    const unit = layout.scale / layout.dpr;
    this.fillPattern(ctx, width, height, PATTERN_TILE, drawKeyboardPattern, KEYBOARD, unit);
    if (!this.floating) {
      this.fillPattern(ctx, width, height, FLOATING_TILE, drawFloatingKeys, FLOATING, unit);
    }
    texture.refresh();
    this.backdrop.setTexture(STATIC_KEY);
  }

  private fillPattern(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    tile: { width: number; height: number },
    draw: (tileCtx: CanvasRenderingContext2D, palette: ThemeData['palette']) => void,
    look: { scale: number; alpha: number },
    unit: number,
  ): void {
    const source = document.createElement('canvas');
    source.width = tile.width;
    source.height = tile.height;
    const tileCtx = source.getContext('2d');
    if (!tileCtx) return;
    draw(tileCtx, this.theme.palette);
    const pattern = ctx.createPattern(source, 'repeat');
    if (!pattern) return;
    ctx.save();
    ctx.globalAlpha = look.alpha;
    ctx.scale(look.scale * unit, look.scale * unit);
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, width / (look.scale * unit), height / (look.scale * unit));
    ctx.restore();
  }

  private applyLayout(layout: Layout): void {
    this.layout = layout;
    this.cameras.main.setSize(layout.canvasWidth, layout.canvasHeight);
    this.drawBackdrop(layout);
    this.backdrop.setDisplaySize(layout.canvasWidth, layout.canvasHeight);
    if (this.floating) {
      this.floating.setSize(layout.canvasWidth / layout.scale, layout.canvasHeight / layout.scale);
      this.floating.setScale(layout.scale);
      this.floating.setTileScale(FLOATING.scale);
    }

    this.panel.clear();
    const { column } = layout;
    const fillsScreen = column.width >= layout.canvasWidth && column.height >= layout.canvasHeight;
    if (fillsScreen) return;
    // Подложка под колонкой отделяет игровое поле от фона по бокам.
    this.panel.fillStyle(COLORS.columnPanel, 0.4);
    this.panel.fillRoundedRect(
      column.x,
      column.y,
      column.width,
      column.height,
      Math.min(32 * layout.dpr, column.width / 8),
    );
  }
}
