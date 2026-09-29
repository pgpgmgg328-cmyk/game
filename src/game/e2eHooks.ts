import type Phaser from 'phaser';
import { sanitizeSave } from '../core/save/schema';
import type { GameContext } from './context';
import { e2eParams } from './e2eParams';
import { BaseScene } from './scenes/BaseScene';
import type { GameScene } from './scenes/Game';
import type { MenuScene } from './scenes/Menu';

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
  const menuScene = (): MenuScene | null => {
    const scene = game.scene.getScene('Menu') as MenuScene | null;
    return scene && scene.sys.isActive() ? scene : null;
  };
  (window as Window & { __e2e?: unknown }).__e2e = {
    scene: () => document.body.dataset.scene ?? '',
    lang: () => ctx.lang,
    layout: () => ctx.layout,
    settings: () => (ctx.saveLoaded ? ctx.save.data.settings : null),
    paused: () => ctx.pause.isPaused,
    gameplayActive: () => ctx.pause.isGameplayActive,
    audio: () => ctx.audio.state,
    /** Статусы сцен Phaser (5 — работает, 6 — на паузе). */
    scenes: () =>
      game.scene
        .getScenes(false)
        .map((scene) => `${scene.sys.settings.key}:${scene.sys.settings.status}`)
        .join(' '),
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
    placeKey: (tier: number, x: number, y: number, golden = false) =>
      gameScene()?.debugPlaceKey(tier, x, y, golden),
    setCurrent: (tier: number, golden = false) => gameScene()?.debugSetCurrent(tier, golden),
    step: (steps: number) => gameScene()?.debugStep(steps),
    freeze: (frozen: boolean) => gameScene()?.debugFreeze(frozen),
    endRun: () => gameScene()?.debugEndRun(),
    /** Снимок забега из локального кэша (как его увидит игра после перезагрузки). */
    savedRun: () => ctx.platform.loadRunSnapshot(),
    stats: () => (ctx.saveLoaded ? ctx.save.data.stats : null),
    /** Состояние меню: монеты, персонажи, спят ли они, длина первого ряда логотипа. */
    menu: () => menuScene()?.debugState() ?? null,
    /** Нажать букву логотипа (ряд и номер буквы). */
    pressLogo: (row: number, index: number) => menuScene()?.debugPressLogo(row, index),
    /** Промотать бездействие в меню. */
    idle: (ms: number) => menuScene()?.debugIdle(ms),
    /** Всё сохранение: монеты, апгрейды, альбом, достижения. */
    save: () => (ctx.saveLoaded ? ctx.save.data : null),
    /**
     * Подменить части сохранения перед проверкой (например, купленные апгрейды или открытый
     * альбом). Данные проходят ту же проверку, что и сохранение из облака.
     */
    patchSave: (patch: Record<string, unknown>) => {
      if (!ctx.saveLoaded) return;
      ctx.save.update((draft) => {
        Object.assign(draft, sanitizeSave({ ...draft, ...patch }));
      });
    },
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
