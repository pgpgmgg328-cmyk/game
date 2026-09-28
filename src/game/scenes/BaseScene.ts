import Phaser from 'phaser';
import { actionForKey, type KeyAction } from '../../core/input';
import type { Layout } from '../../core/layout';
import { LAYOUT_EVENT, getContext, type GameContext } from '../context';
import { FONT_FAMILY } from '../fonts';
import type { Button, ButtonHost } from '../ui/Button';

/** Технические сцены, которые не считаются экраном игры. */
const SERVICE_SCENES = new Set(['Boot', 'Background']);

/**
 * Помечает верхний видимый экран в <body data-scene="…">: по этой метке автотесты понимают,
 * какой экран открыт. Для игрока ничего не меняется.
 */
export function markTopScene(game: Phaser.Game, closing?: Phaser.Scene): void {
  const { RUNNING, PAUSED } = Phaser.Scenes;
  const visible = game.scene.scenes.filter((scene) => {
    const status = scene.sys.settings.status;
    return (
      scene !== closing &&
      !SERVICE_SCENES.has(scene.sys.settings.key) &&
      (status === RUNNING || status === PAUSED)
    );
  });
  const top = visible[visible.length - 1];
  document.body.dataset.scene = top ? top.sys.settings.key : '';
}

/**
 * Основа экранов игры. Камера показывает портретную колонку шириной 720 логических пикселей,
 * при ресайзе и повороте экран перекладывает элементы без перезапуска.
 */
export abstract class BaseScene extends Phaser.Scene implements ButtonHost {
  private texts = new Set<Phaser.GameObjects.Text>();
  private buttons: Button[] = [];
  private cleanups: (() => void)[] = [];

  protected get ctx(): GameContext {
    return getContext(this.game);
  }

  /** Высота колонки в логических пикселях. */
  protected get screenHeight(): number {
    return this.ctx.layout.logicalHeight;
  }

  /** Расставить элементы экрана под высоту колонки. Вызывается при создании и при ресайзе. */
  protected abstract layoutScreen(height: number): void;

  /** Вызывать первым делом в create(). */
  protected setupScreen(): void {
    this.texts = new Set();
    this.buttons = [];
    this.cleanups = [];
    this.applyCamera(this.ctx.layout);

    const onLayout = (layout: Layout): void => {
      this.applyCamera(layout);
      const resolution = this.textResolution();
      this.texts.forEach((text) => text.setResolution(resolution));
      this.layoutScreen(layout.logicalHeight);
    };
    this.game.events.on(LAYOUT_EVENT, onLayout);
    this.addCleanup(() => this.game.events.off(LAYOUT_EVENT, onLayout));

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      const cleanups = this.cleanups;
      this.cleanups = [];
      cleanups.forEach((cleanup) => cleanup());
      markTopScene(this.game, this);
    });
    this.events.once(Phaser.Scenes.Events.CREATE, () => markTopScene(this.game));
  }

  protected addCleanup(cleanup: () => void): void {
    this.cleanups.push(cleanup);
  }

  createText(
    x: number,
    y: number,
    text: string,
    style: Phaser.Types.GameObjects.Text.TextStyle,
    addToScene = true,
  ): Phaser.GameObjects.Text {
    const fullStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: FONT_FAMILY,
      padding: { x: 6, y: 6 },
      resolution: this.textResolution(),
      ...style,
    };
    const object = addToScene
      ? this.add.text(x, y, text, fullStyle)
      : new Phaser.GameObjects.Text(this, x, y, text, fullStyle);
    this.texts.add(object);
    object.once(Phaser.GameObjects.Events.DESTROY, () => this.texts.delete(object));
    return object;
  }

  registerButton(button: Button): void {
    this.buttons.push(button);
    button.once(Phaser.GameObjects.Events.DESTROY, () => {
      this.buttons = this.buttons.filter((item) => item !== button);
    });
  }

  playButtonSound(): void {
    this.ctx.audio.ui();
  }

  /** Кнопки экрана (для автотестов). */
  getButtons(): readonly Button[] {
    return this.buttons;
  }

  /**
   * Действия с клавиатуры по event.code. Работают, только пока экран активен
   * (не на паузе и не закрыт). Удаляются вместе со сценой.
   */
  protected onKeyAction(handler: (action: KeyAction) => void): void {
    const listener = (event: KeyboardEvent): void => {
      const action = actionForKey(event);
      if (!action || !this.sys.isActive()) return;
      event.preventDefault();
      if (event.repeat) return;
      handler(action);
    };
    window.addEventListener('keydown', listener);
    this.addCleanup(() => window.removeEventListener('keydown', listener));
  }

  private applyCamera(layout: Layout): void {
    const camera = this.cameras.main;
    camera.setSize(layout.canvasWidth, layout.canvasHeight);
    camera.setOrigin(0, 0);
    camera.setZoom(layout.scale);
    camera.setScroll(-layout.column.x / layout.scale, -layout.column.y / layout.scale);
  }

  /** Текст рисуется с запасом по плотности, чтобы не расплываться при увеличении колонки. */
  private textResolution(): number {
    return Math.min(3, Math.max(1, Math.ceil(this.ctx.layout.scale - 0.01)));
  }
}
