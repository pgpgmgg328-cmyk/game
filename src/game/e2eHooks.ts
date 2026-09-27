import Phaser from 'phaser';
import type { GameContext } from './context';
import { BaseScene } from './scenes/BaseScene';

export interface E2eButton {
  id: string;
  label: string;
  scene: string;
  /** Прямоугольник кнопки в CSS-пикселях окна. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Хуки для автотестов Playwright. Появляются только с параметром ?e2e в адресе,
 * игроку и модерации не видны.
 */
export function installE2eHooks(game: Phaser.Game, ctx: GameContext): void {
  if (!new URLSearchParams(window.location.search).has('e2e')) return;
  (window as Window & { __e2e?: unknown }).__e2e = {
    scene: () => document.body.dataset.scene ?? '',
    lang: () => ctx.lang,
    layout: () => ctx.layout,
    settings: () => (ctx.saveLoaded ? ctx.save.data.settings : null),
    paused: () => ctx.pause.isPaused,
    gameplayActive: () => ctx.pause.isGameplayActive,
    buttons: (): E2eButton[] => collectButtons(game, ctx),
  };
}

function collectButtons(game: Phaser.Game, ctx: GameContext): E2eButton[] {
  const canvas = game.canvas.getBoundingClientRect();
  const { dpr } = ctx.layout;
  const result: E2eButton[] = [];
  for (const scene of game.scene.getScenes(true)) {
    if (!(scene instanceof BaseScene)) continue;
    const camera = scene.cameras.main;
    for (const button of scene.getButtons()) {
      if (!button.visible || !button.input?.enabled) continue;
      const bounds = button.worldRect();
      result.push({
        id: button.id,
        label: button.text,
        scene: scene.sys.settings.key,
        x: canvas.left + ((bounds.x - camera.scrollX) * camera.zoom) / dpr,
        y: canvas.top + ((bounds.y - camera.scrollY) * camera.zoom) / dpr,
        width: (bounds.width * camera.zoom) / dpr,
        height: (bounds.height * camera.zoom) / dpr,
      });
    }
  }
  return result;
}
