import Phaser from 'phaser';
import type { Layout } from '../../core/layout';
import { LAYOUT_EVENT, getContext } from '../context';
import { COLORS } from '../ui/theme';

const GRADIENT_KEY = 'ui-sky-gradient';

/**
 * Фон на весь экран: мягкий градиент, под игровой колонкой — светлая подложка.
 * В альбомной ориентации и на десктопе по бокам виден фон, а не чёрная заливка (CLAUDE.md).
 * Сцена работает всё время и рисуется под остальными.
 */
export class BackgroundScene extends Phaser.Scene {
  private sky!: Phaser.GameObjects.Image;
  private panel!: Phaser.GameObjects.Graphics;

  constructor() {
    super('Background');
  }

  create(): void {
    if (!this.textures.exists(GRADIENT_KEY)) {
      // Градиент через canvas-текстуру работает и в WebGL, и в запасном Canvas-рендере.
      const texture = this.textures.createCanvas(GRADIENT_KEY, 2, 512);
      if (texture) {
        const context = texture.getContext();
        const gradient = context.createLinearGradient(0, 0, 0, 512);
        gradient.addColorStop(0, COLORS.skyTop);
        gradient.addColorStop(1, COLORS.skyBottom);
        context.fillStyle = gradient;
        context.fillRect(0, 0, 2, 512);
        texture.refresh();
      }
    }
    this.sky = this.add.image(0, 0, GRADIENT_KEY).setOrigin(0, 0);
    this.panel = this.add.graphics();
    this.cameras.main.setOrigin(0, 0);

    const onLayout = (layout: Layout): void => this.applyLayout(layout);
    this.game.events.on(LAYOUT_EVENT, onLayout);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
      this.game.events.off(LAYOUT_EVENT, onLayout),
    );
    this.applyLayout(getContext(this.game).layout);
  }

  private applyLayout(layout: Layout): void {
    this.cameras.main.setSize(layout.canvasWidth, layout.canvasHeight);
    this.sky.setDisplaySize(layout.canvasWidth, layout.canvasHeight);

    this.panel.clear();
    const { column } = layout;
    const fillsScreen = column.width >= layout.canvasWidth && column.height >= layout.canvasHeight;
    if (fillsScreen) return;
    // Подложка под колонкой отделяет игровое поле от фона по бокам.
    this.panel.fillStyle(COLORS.columnPanel, 0.3);
    this.panel.fillRoundedRect(
      column.x,
      column.y,
      column.width,
      column.height,
      Math.min(32 * layout.dpr, column.width / 8),
    );
  }
}
