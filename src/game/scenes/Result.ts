import type Phaser from 'phaser';
import { Button } from '../ui/Button';
import { BaseScene } from './BaseScene';
import { titleStyle } from './titleStyle';

/** Экран результата забега. Очки, рекорд и монеты появятся в M1–M2 вместе с забегом. */
export class ResultScene extends BaseScene {
  private title!: Phaser.GameObjects.Text;
  private again!: Button;
  private menu!: Button;

  constructor() {
    super('Result');
  }

  create(): void {
    this.setupScreen();
    const { t } = this.ctx;
    this.title = this.createText(360, 0, t('result.title'), titleStyle(64)).setOrigin(0.5);
    this.again = new Button(this, 360, 0, {
      id: 'result.again',
      label: t('result.again'),
      width: 480,
      variant: 'primary',
      onClick: () => this.scene.start('Game'),
    });
    this.menu = new Button(this, 360, 0, {
      id: 'result.menu',
      label: t('result.menu'),
      width: 480,
      onClick: () => this.scene.start('Menu'),
    });
    this.layoutScreen(this.screenHeight);
  }

  protected layoutScreen(height: number): void {
    this.title.setPosition(360, Math.min(Math.max(height * 0.1, 80), 180));
    const bottom = height - Math.max(40, height * 0.05);
    this.menu.setPosition(360, bottom - 55);
    this.again.setPosition(360, bottom - 55 - 110 - 28);
  }
}
