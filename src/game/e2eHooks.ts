import type Phaser from 'phaser';
import type { GameContext } from './context';
import { e2eParams } from './e2eParams';
import { BaseScene } from './scenes/BaseScene';
import type { GameScene } from './scenes/Game';

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
  if (!e2eParams()) return;
  const gameScene = (): GameScene | null => {
    const scene = game.scene.getScene('Game') as GameScene | null;
    return scene && (scene.sys.isActive() || scene.sys.isPaused()) ? scene : null;
  };
  (window as Window & { __e2e?: unknown }).__e2e = {
    scene: () => document.body.dataset.scene ?? '',
    lang: () => ctx.lang,
    layout: () => ctx.layout,
    settings: () => (ctx.saveLoaded ? ctx.save.data.settings : null),
    paused: () => ctx.pause.isPaused,
    gameplayActive: () => ctx.pause.isGameplayActive,
    buttons: (): E2eButton[] => collectButtons(game, ctx),
    /** Состояние забега или null, если экран забега не открыт. */
    run: () => gameScene()?.debugState() ?? null,
    /** Точка банки (единицы физики) в CSS-пикселях окна: чтобы нажать туда пальцем или мышью. */
    jarPoint: (x: number, y: number) => {
      const scene = gameScene();
      if (!scene) return null;
      const point = scene.jarToScene(x, y);
      return toCss(game, ctx, scene.cameras.main, point.x, point.y);
    },
    placeKey: (tier: number, x: number, y: number) => gameScene()?.debugPlaceKey(tier, x, y),
    setCurrent: (tier: number) => gameScene()?.debugSetCurrent(tier),
    step: (steps: number) => gameScene()?.debugStep(steps),
    freeze: (frozen: boolean) => gameScene()?.debugFreeze(frozen),
  };
}

function toCss(
  game: Phaser.Game,
  ctx: GameContext,
  camera: Phaser.Cameras.Scene2D.Camera,
  x: number,
  y: number,
): { x: number; y: number } {
  const canvas = game.canvas.getBoundingClientRect();
  const { dpr } = ctx.layout;
  return {
    x: canvas.left + ((x - camera.scrollX) * camera.zoom) / dpr,
    y: canvas.top + ((y - camera.scrollY) * camera.zoom) / dpr,
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
