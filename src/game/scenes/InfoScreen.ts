import type Phaser from 'phaser';
import type { TranslationKey } from '../../i18n';
import { Button } from '../ui/Button';
import { BaseScene } from './BaseScene';
import { titleStyle } from './titleStyle';

/**
 * Экран с заголовком и кнопкой «Назад». Основа для экранов, чьё содержимое появится
 * в следующих этапах: миры, альбом, апгрейды, магазин, рекорды.
 */
export abstract class InfoScreenScene extends BaseScene {
  private readonly titleKey: TranslationKey;
  private title!: Phaser.GameObjects.Text;
  private back!: Button;

  constructor(key: string, titleKey: TranslationKey) {
    super(key);
    this.titleKey = titleKey;
  }

  create(): void {
    this.setupScreen();
    this.title = this.createText(360, 0, this.ctx.t(this.titleKey), titleStyle(64)).setOrigin(0.5);
    this.back = new Button(this, 360, 0, {
      id: 'common.back',
      label: this.ctx.t('common.back'),
      width: 400,
      onClick: () => this.scene.start('Menu'),
    });
    this.layoutScreen(this.screenHeight);
  }

  protected layoutScreen(height: number): void {
    this.title.setPosition(360, Math.min(Math.max(height * 0.1, 80), 180));
    this.back.setPosition(360, height - Math.max(40, height * 0.05) - 55);
  }
}
