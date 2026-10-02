import Phaser from 'phaser';
import { chooseAim } from '../core/run/bot';
import { BaseScene } from './scenes/BaseScene';
import type { GameScene } from './scenes/Game';

/** Как часто бот смотрит на экран. */
const TICK_MS = 200;

interface Pace {
  /** Пауза перед броском, мс: [от, до]. */
  think: readonly [number, number];
  /** Доля случайных бросков. */
  randomShare: number;
  /** Сколько бот «читает» экраны вне забега, мс. */
  screenMs: number;
  /** Как часто смотрит рекламу за награду, когда её предлагают. */
  watchShare: number;
}

const PACES: Record<'normal' | 'fast', Pace> = {
  // Обычный темп: красиво для промо-видео.
  normal: { think: [700, 1300], randomShare: 0.25, screenMs: 1800, watchShare: 0.5 },
  // Быстро и небрежно: soak-тест проходит много забегов, экранов и показов рекламы.
  fast: { think: [200, 400], randomShare: 0.9, screenMs: 500, watchShare: 0.5 },
};

/** Нажать кнопку экрана по id так же, как это делает палец: нажатие и отпускание. */
function press(scene: BaseScene, id: string): boolean {
  const button = scene
    .getButtons()
    .find((item) => item.id === id && item.visible && item.input?.enabled && !item.isDisabled);
  if (!button) return false;
  button.emit(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN);
  button.emit(Phaser.Input.Events.GAMEOBJECT_POINTER_UP);
  return true;
}

/**
 * Бот (диздок, раздел 12: «?bot=1: бот играет сам»): для soak-теста и записи промо-видео.
 * Сам начинает забег, бросает клавиши «внимательным» способом (core/run/bot.ts), иногда
 * смотрит рекламу за награду и снова играет. Игроку не виден: включается только параметром.
 */
export function installBot(game: Phaser.Game, mode: 'normal' | 'fast'): void {
  const pace = PACES[mode];
  let nextAt = 0;
  const wait = (ms: number): void => {
    nextAt = performance.now() + ms;
  };
  window.setInterval(() => {
    if (performance.now() < nextAt) return;
    const key = document.body.dataset.scene ?? '';
    const scene = game.scene.getScene(key);
    if (!(scene instanceof BaseScene) || !scene.sys.isActive()) return;
    switch (key) {
      case 'Game': {
        const run = scene as GameScene;
        run.botSkipReveal();
        const view = run.botView();
        if (!view) return;
        run.botDrop(chooseAim(view, Math.random, pace.randomShare));
        const [from, to] = pace.think;
        wait(from + Math.random() * (to - from));
        return;
      }
      case 'Menu':
        // Прерванный забег бот продолжает: так проверяется и восстановление из снимка.
        if (!press(scene, 'resume.yes')) press(scene, 'menu.play');
        break;
      case 'Offer':
        if (Math.random() >= pace.watchShare || !press(scene, 'offer.watch')) {
          press(scene, 'offer.decline');
        }
        break;
      case 'Result':
        if (Math.random() >= pace.watchShare || !press(scene, 'result.double')) {
          press(scene, 'result.again');
        }
        break;
      case 'Pause':
        press(scene, 'pause.continue');
        break;
      default:
        press(scene, 'common.back');
    }
    wait(pace.screenMs);
  }, TICK_MS);
}
