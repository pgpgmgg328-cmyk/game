import './style.css';
import Phaser from 'phaser';
import { installBot } from './game/bot';
import { installBrowserGuards } from './game/browserGuards';
import { CONTEXT_KEY, GameContext, LAYOUT_EVENT } from './game/context';
import { installE2eHooks } from './game/e2eHooks';
import { botMode } from './game/e2eParams';
import { bindLifecycle } from './game/lifecycle';
import { AlbumScene } from './game/scenes/Album';
import { BackgroundScene } from './game/scenes/Background';
import { BootScene } from './game/scenes/Boot';
import { GameScene } from './game/scenes/Game';
import { LeaderboardScene } from './game/scenes/Leaderboard';
import { MenuScene } from './game/scenes/Menu';
import { OfferScene } from './game/scenes/Offer';
import { PauseScene } from './game/scenes/Pause';
import { PreloadScene } from './game/scenes/Preload';
import { ResultScene } from './game/scenes/Result';
import { SettingsScene } from './game/scenes/Settings';
import { ShopScene } from './game/scenes/Shop';
import { UpgradesScene } from './game/scenes/Upgrades';
import { WorldsScene } from './game/scenes/Worlds';
import { Viewport } from './game/viewport';
import { createPlatform } from './platform';

const container = document.getElementById('game');
if (!container) throw new Error('Нет элемента #game');

installBrowserGuards();
const viewport = new Viewport(container, Viewport.guessDesktop());
const reducedMotion =
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const ctx = new GameContext(createPlatform(), viewport, reducedMotion);
const initial = viewport.current;

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: container,
  width: initial.canvasWidth,
  height: initial.canvasHeight,
  backgroundColor: '#bfe6ff',
  banner: false,
  disableContextMenu: true,
  // Звук синтезируем сами через WebAudio после первого жеста игрока, встроенный звук Phaser не нужен.
  audio: { noAudio: true },
  // Canvas в физических пикселях (не больше 2 на CSS-пиксель), на экране — в CSS-пикселях.
  scale: { mode: Phaser.Scale.NONE, zoom: 1 / initial.dpr },
  callbacks: { preBoot: (booting) => booting.registry.set(CONTEXT_KEY, ctx) },
  // Порядок важен: сцены ниже по списку рисуются поверх. Фон — самый нижний.
  scene: [
    BootScene,
    BackgroundScene,
    PreloadScene,
    MenuScene,
    GameScene,
    ResultScene,
    WorldsScene,
    AlbumScene,
    UpgradesScene,
    ShopScene,
    LeaderboardScene,
    SettingsScene,
    PauseScene,
    OfferScene,
  ],
});

viewport.onChange((layout) => {
  game.scale.resize(layout.canvasWidth, layout.canvasHeight);
  game.scale.setZoom(1 / layout.dpr);
  game.events.emit(LAYOUT_EVENT, layout);
});
viewport.start();
bindLifecycle(ctx, container, () => returnToMenu(game));
installE2eHooks(game, ctx);
const bot = botMode();
if (bot !== 'off') installBot(game, bot);

/**
 * Выход в главное меню из любого экрана: после окна выбора аккаунта прогресс другой
 * (docs/yandex/sdk/sdk-events.md), открытые экраны показывают устаревшие данные.
 */
function returnToMenu(phaserGame: Phaser.Game): void {
  const keep = new Set(['Boot', 'Background', 'Preload']);
  for (const scene of phaserGame.scene.getScenes(false)) {
    const key = scene.sys.settings.key;
    if (keep.has(key)) continue;
    if (scene.sys.isActive() || scene.sys.isPaused()) phaserGame.scene.stop(key);
  }
  phaserGame.scene.start('Menu');
}
