import Phaser from 'phaser';
import { Button } from '../ui/Button';
import { COLORS } from '../ui/theme';
import { toggleLabel, toggleSetting, type ToggleSetting } from '../settingsToggles';
import { BaseScene } from './BaseScene';
import { titleStyle } from './titleStyle';

/** Пауза поверх забега: продолжить, звук, музыка, выход в меню. */
export class PauseScene extends BaseScene {
  private shade!: Phaser.GameObjects.Rectangle;
  private panel!: Phaser.GameObjects.Graphics;
  private title!: Phaser.GameObjects.Text;
  private rows: Button[] = [];

  constructor() {
    super('Pause');
  }

  create(): void {
    this.setupScreen();
    const { t } = this.ctx;
    // Затемнение ловит нажатия, чтобы они не проходили к забегу.
    this.shade = this.add.rectangle(0, 0, 720, 100, COLORS.dim, 0.45).setOrigin(0, 0);
    this.shade.setInteractive();
    this.panel = this.add.graphics();
    this.title = this.createText(360, 0, t('pause.title'), titleStyle(64)).setOrigin(0.5);

    const toggle = (setting: ToggleSetting, id: string): Button => {
      const button: Button = new Button(this, 360, 0, {
        id,
        label: toggleLabel(this.ctx, setting),
        width: 480,
        onClick: () => {
          toggleSetting(this.ctx, setting);
          button.setText(toggleLabel(this.ctx, setting));
        },
      });
      return button;
    };
    this.rows = [
      new Button(this, 360, 0, {
        id: 'pause.continue',
        label: t('pause.continue'),
        width: 480,
        variant: 'primary',
        onClick: () => this.resumeRun(),
      }),
      toggle('sound', 'pause.sound'),
      toggle('music', 'pause.music'),
      new Button(this, 360, 0, {
        id: 'pause.menu',
        label: t('pause.menu'),
        width: 480,
        onClick: () => this.exitToMenu(),
      }),
    ];
    // Space/Enter и повторный Esc/P продолжают забег.
    this.onKeyAction((action) => {
      if (action === 'drop' || action === 'pause') this.resumeRun();
    });
    this.layoutScreen(this.screenHeight);
  }

  protected layoutScreen(height: number): void {
    // Затемнение на весь экран, включая фон по бокам от колонки.
    const { canvasWidth, canvasHeight, column, scale } = this.ctx.layout;
    const shadeWidth = canvasWidth / scale;
    const shadeHeight = canvasHeight / scale;
    this.shade.setPosition(-column.x / scale, -column.y / scale);
    this.shade.setSize(shadeWidth, shadeHeight);
    if (this.shade.input) this.shade.input.hitArea.setSize(shadeWidth, shadeHeight);

    const gap = height < 1000 ? 14 : 24;
    const buttonHeight = 110;
    const titleHeight = 130;
    const contentHeight = titleHeight + this.rows.length * (buttonHeight + gap);
    const top = Math.max(24, (height - contentHeight) / 2);

    this.panel.clear();
    this.panel.fillStyle(COLORS.panel, 0.92);
    this.panel.fillRoundedRect(96, top - 24, 528, contentHeight + 32, 40);

    this.title.setPosition(360, top + titleHeight / 2);
    this.rows.forEach((button, index) => {
      button.setPosition(360, top + titleHeight + index * (buttonHeight + gap) + buttonHeight / 2);
    });
  }

  private resumeRun(): void {
    this.ctx.pause.setUserPaused(false);
    this.scene.stop();
  }

  private exitToMenu(): void {
    this.scene.stop('Game');
    this.scene.start('Menu');
  }
}
