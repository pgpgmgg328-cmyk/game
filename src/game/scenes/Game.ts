import { Button } from '../ui/Button';
import { BaseScene } from './BaseScene';
import Phaser from 'phaser';

const PAUSE_BUTTON_SIZE = 116;

/**
 * Экран забега. В M0 здесь только кнопка паузы; банка и клавиши появятся в M1.
 * Пока экран открыт, забег активен: площадке уходит GameplayAPI.start(), на паузе — stop().
 */
export class GameScene extends BaseScene {
  private pauseButton!: Button;

  constructor() {
    super('Game');
  }

  create(): void {
    this.setupScreen();
    this.pauseButton = new Button(this, 0, 0, {
      id: 'game.pause',
      icon: 'pause',
      width: PAUSE_BUTTON_SIZE,
      height: PAUSE_BUTTON_SIZE,
      onClick: () => this.openPause(),
    });
    this.layoutScreen(this.screenHeight);

    const { pause } = this.ctx;
    // Любая пауза (игрок, вкладка, фокус, реклама, SDK) останавливает физику, таймеры и анимации сцены.
    this.addCleanup(
      pause.subscribe({
        onPausedChange: (paused) => {
          // Пока открыт экран паузы, своя кнопка паузы не нужна и не должна выглядывать из-под окна.
          this.pauseButton.setVisible(!pause.isUserPaused);
          if (paused && this.sys.isActive()) this.scene.pause();
          else if (!paused && this.sys.isPaused()) this.scene.resume();
        },
      }),
    );
    pause.setRunActive(true);
    this.addCleanup(() => pause.setRunActive(false));
    // Если забег начался во время системной паузы, ставим сцену на паузу сразу после создания.
    this.events.once(Phaser.Scenes.Events.CREATE, () => {
      if (pause.isPaused) this.scene.pause();
    });
  }

  protected layoutScreen(_height: number): void {
    this.pauseButton.setPosition(720 - 24 - PAUSE_BUTTON_SIZE / 2, 24 + PAUSE_BUTTON_SIZE / 2);
  }

  private openPause(): void {
    this.ctx.pause.setUserPaused(true);
    this.scene.launch('Pause');
  }
}
