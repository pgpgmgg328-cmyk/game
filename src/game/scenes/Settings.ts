import type Phaser from 'phaser';
import { toggleLabel, toggleSetting, type ToggleSetting } from '../settingsToggles';
import { Button } from '../ui/Button';
import { BaseScene } from './BaseScene';
import { titleStyle } from './titleStyle';

/** Настройки: звук и музыка. Выбор сохраняется сразу. */
export class SettingsScene extends BaseScene {
  private title!: Phaser.GameObjects.Text;
  private toggles: Button[] = [];
  private back!: Button;

  constructor() {
    super('Settings');
  }

  create(): void {
    this.setupScreen();
    const { t } = this.ctx;
    this.title = this.createText(360, 0, t('settings.title'), titleStyle(64)).setOrigin(0.5);
    const toggle = (setting: ToggleSetting): Button => {
      const button: Button = new Button(this, 360, 0, {
        id: `settings.${setting}`,
        label: toggleLabel(this.ctx, setting),
        width: 480,
        onClick: () => {
          toggleSetting(this.ctx, setting);
          button.setText(toggleLabel(this.ctx, setting));
        },
      });
      return button;
    };
    this.toggles = [toggle('sound'), toggle('music')];
    this.back = new Button(this, 360, 0, {
      id: 'common.back',
      label: t('common.back'),
      width: 400,
      onClick: () => this.scene.start('Menu'),
    });
    this.layoutScreen(this.screenHeight);
  }

  protected layoutScreen(height: number): void {
    this.title.setPosition(360, Math.min(Math.max(height * 0.1, 80), 180));
    const gap = 28;
    const blockHeight = this.toggles.length * 110 + (this.toggles.length - 1) * gap;
    const top = height / 2 - blockHeight / 2;
    this.toggles.forEach((button, index) =>
      button.setPosition(360, top + 55 + index * (110 + gap)),
    );
    this.back.setPosition(360, height - Math.max(40, height * 0.05) - 55);
  }
}
