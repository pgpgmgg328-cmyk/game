import Phaser from 'phaser';
import type { Layout } from '../../core/layout';
import { activeDecor } from '../../core/meta/decor';
import { DEFAULT_THEME_ID, getTheme, THEMES, type ThemeData } from '../../themes';
import { BACKGROUNDS, type BackgroundSkin } from '../../themes/decor';
import {
  FLOATING_LAYER,
  FLOATING_TILE,
  backdropLook,
  drawFloatingKeys,
  paintBackdrop,
} from '../art/backgroundArt';
import { LAYOUT_EVENT, getContext } from '../context';
import { COLORS } from '../ui/theme';

/** Парящие клавиши плывут и чуть сдвигаются за пальцем или мышью. */
const FLOATING = { speed: 12, parallax: 56 } as const;
const STATIC_KEY = 'bg-static';

/**
 * Фон на весь экран (диздок, раздел 12): мягкий градиент мира с едва заметной клавиатурой
 * и парящие клавиши поверх, которые медленно плывут и чуть сдвигаются за пальцем или мышью
 * (лёгкий параллакс: дальний слой стоит, ближний движется). Градиент и клавиатура рисуются
 * один раз в одну картинку — на каждый кадр остаётся два полноэкранных слоя, а при «уменьшить
 * движение» — один. Под игровой колонкой — светлая подложка; в альбомной ориентации и на
 * десктопе по бокам виден фон, а не чёрная заливка (CLAUDE.md). Фон из «Украшений» заменяет
 * цвета и узор мира (например, облака вместо клавиатуры).
 */
export class BackgroundScene extends Phaser.Scene {
  private backdrop!: Phaser.GameObjects.Image;
  private floating: Phaser.GameObjects.TileSprite | null = null;
  private panel!: Phaser.GameObjects.Graphics;
  private theme: ThemeData = THEMES[0]!;
  private skin: BackgroundSkin = BACKGROUNDS[0]!;
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
    this.skin = this.currentSkin();
    this.backdrop = this.add.image(0, 0, '__DEFAULT').setOrigin(0, 0);
    if (!this.reducedMotion) {
      this.ensureFloating();
      this.floating = this.add
        .tileSprite(0, 0, 16, 16, this.floatingKey())
        .setOrigin(0, 0)
        .setAlpha(FLOATING_LAYER.alpha);
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

  /** Фон мира: градиент и узоры в его цветах (или в цветах выбранного фона из «Украшений»). */
  setTheme(theme: ThemeData): void {
    const skin = this.currentSkin();
    if ((theme === this.theme && skin === this.skin) || !this.backdrop) return;
    this.theme = theme;
    this.skin = skin;
    if (this.floating) {
      this.ensureFloating();
      this.floating.setTexture(this.floatingKey());
    }
    if (this.layout) this.applyLayout(this.layout);
  }

  /** Игрок выбрал другой фон в «Украшениях». */
  refreshDecor(): void {
    this.setTheme(this.theme);
  }

  /** Для автотестов: какой мир и какой фон из «Украшений» сейчас нарисованы. */
  debugState(): { theme: string; skin: string } {
    return { theme: this.theme.id, skin: this.skin.id };
  }

  /** Выбранный фон; до загрузки сохранений — фон мира. */
  private currentSkin(): BackgroundSkin {
    const ctx = getContext(this.game);
    return ctx.saveLoaded ? activeDecor(ctx.save.data, BACKGROUNDS) : BACKGROUNDS[0]!;
  }

  private floatingKey(): string {
    return `bg-floating:${this.theme.id}:${this.skin.id}`;
  }

  private ensureFloating(): void {
    const key = this.floatingKey();
    if (this.textures.exists(key)) return;
    const texture = this.textures.createCanvas(key, FLOATING_TILE.width, FLOATING_TILE.height);
    if (!texture) return;
    drawFloatingKeys(texture.getContext(), backdropLook(this.theme, this.skin).palette);
    texture.refresh();
  }

  /**
   * Неподвижная часть фона одной картинкой в CSS-пикселях экрана: градиент, узор и (если
   * движение выключено) парящие клавиши. Перерисовывается только при смене размера, мира или фона.
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
    const look = backdropLook(this.theme, this.skin);
    paintBackdrop(
      texture.getContext(),
      width,
      height,
      look,
      layout.scale / layout.dpr,
      !this.floating,
    );
    texture.refresh();
    this.backdrop.setTexture(STATIC_KEY);
  }

  private applyLayout(layout: Layout): void {
    this.layout = layout;
    this.cameras.main.setSize(layout.canvasWidth, layout.canvasHeight);
    this.drawBackdrop(layout);
    this.backdrop.setDisplaySize(layout.canvasWidth, layout.canvasHeight);
    if (this.floating) {
      this.floating.setSize(layout.canvasWidth / layout.scale, layout.canvasHeight / layout.scale);
      this.floating.setScale(layout.scale);
      this.floating.setTileScale(FLOATING_LAYER.scale);
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
