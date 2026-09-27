import Phaser from 'phaser';
import type { TranslationKey } from '../../i18n';
import { Button } from '../ui/Button';
import { BaseScene } from './BaseScene';
import { titleStyle } from './titleStyle';

const MENU_ITEMS: readonly { key: TranslationKey; scene: string }[] = [
  { key: 'menu.worlds', scene: 'Worlds' },
  { key: 'menu.album', scene: 'Album' },
  { key: 'menu.upgrades', scene: 'Upgrades' },
  { key: 'menu.shop', scene: 'Shop' },
  { key: 'menu.leaderboard', scene: 'Leaderboard' },
  { key: 'menu.settings', scene: 'Settings' },
];

/** На низком экране (телефон в альбомной ориентации) кнопки встают в три колонки вместо двух. */
const COMPACT_HEIGHT = 1000;

export class MenuScene extends BaseScene {
  private title!: Phaser.GameObjects.Text;
  private play!: Button;
  private items: Button[] = [];

  constructor() {
    super('Menu');
  }

  create(): void {
    this.setupScreen();
    const { t } = this.ctx;
    // Название в две строки: «Сквиши Клавиши:» и «Мерж до Пробела».
    this.title = this.createText(360, 0, t('game.title').replace(': ', ':\n'), titleStyle(60))
      .setOrigin(0.5, 0)
      .setLineSpacing(-8);
    this.play = new Button(this, 360, 0, {
      id: 'menu.play',
      label: t('menu.play'),
      width: 480,
      height: 170,
      variant: 'primary',
      fontSize: 76,
      onClick: () => this.startGame(),
    });
    this.items = MENU_ITEMS.map(
      (item) =>
        new Button(this, 0, 0, {
          id: item.key,
          label: t(item.key),
          width: 320,
          height: 120,
          fontSize: 40,
          onClick: () => this.scene.start(item.scene),
        }),
    );
    this.onKeyAction((action) => {
      if (action === 'drop') this.startGame();
    });
    this.layoutScreen(this.screenHeight);

    if (!this.ctx.reducedMotion) {
      this.tweens.add({
        targets: this.play,
        scale: 1.05,
        duration: 650,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    // LoadingAPI.ready(): меню нарисовано и принимает ввод (п. 1.19.2). Повторные вызовы игнорируются.
    this.game.events.once(Phaser.Core.Events.POST_RENDER, () => this.ctx.platform.ready());
  }

  protected layoutScreen(height: number): void {
    const compact = height < COMPACT_HEIGHT;
    this.title.setFontSize(compact ? 48 : 60);
    this.title.setStroke(titleStyle(compact ? 48 : 60).stroke ?? '', compact ? 10 : 12);
    this.title.setY(Math.min(Math.max(height * 0.05, 24), 90));

    const titleBottom = this.title.y + this.title.height;
    const playHeight = compact ? 150 : 170;
    this.play.setButtonSize(compact ? 420 : 480, playHeight);

    const columns = compact ? 3 : 2;
    const rows = Math.ceil(this.items.length / columns);
    const itemWidth = compact ? 212 : 320;
    const itemHeight = compact ? 116 : 124;
    const gap = compact ? 16 : 24;
    const gridHeight = rows * itemHeight + (rows - 1) * gap;

    // Свободное место делим между отступами, чтобы на высоком экране меню не липло к верху.
    const free = Math.max(0, height - titleBottom - playHeight - gridHeight - 40);
    const playY = titleBottom + Math.max(gap, free * 0.3) + playHeight / 2;
    const gridTop = playY + playHeight / 2 + Math.max(gap * 1.5, free * 0.2);
    this.play.setPosition(360, playY);

    const rowWidth = columns * itemWidth + (columns - 1) * gap;
    this.items.forEach((item, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      item.setButtonSize(itemWidth, itemHeight);
      item.setPosition(
        360 - rowWidth / 2 + itemWidth / 2 + column * (itemWidth + gap),
        gridTop + itemHeight / 2 + row * (itemHeight + gap),
      );
    });
  }

  private startGame(): void {
    this.scene.start('Game');
  }
}
