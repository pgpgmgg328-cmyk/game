import type Phaser from 'phaser';
import { AudioEngine } from '../audio/AudioEngine';
import { defaultFlags, type GameFlags } from '../core/flags';
import type { Layout } from '../core/layout';
import type { RunSnapshot } from '../core/run/snapshot';
import { PauseController } from '../core/pause/PauseController';
import type { SaveManager } from '../core/save/SaveManager';
import { createTranslator, type Lang, type Translate } from '../i18n';
import type { Platform } from '../platform';
import { AdService } from './AdService';
import { PurchaseService } from './PurchaseService';
import type { Viewport } from './viewport';

/** Ключ контекста в game.registry. */
export const CONTEXT_KEY = 'ctx';
/** Событие game.events: изменился размер экрана, аргумент — новый Layout. */
export const LAYOUT_EVENT = 'layout-changed';

/** Общие сервисы игры, доступные всем сценам. */
export class GameContext {
  readonly platform: Platform;
  readonly viewport: Viewport;
  readonly pause = new PauseController();
  /** Синтез звука и музыки (включается по первому жесту игрока). */
  readonly audio = new AudioEngine();
  /** Показ рекламы: пауза и тишина на время показа, правила полноэкранной рекламы. */
  readonly ads: AdService;
  /** Покупки: выдача, запись в облако, консумирование, восстановление при запуске. */
  readonly purchases: PurchaseService;
  /** Игрок попросил браузер убрать лишнюю анимацию (prefers-reduced-motion). */
  readonly reducedMotion: boolean;
  lang: Lang = 'ru';
  /** Забег, прерванный перезагрузкой страницы: меню предложит его продолжить. */
  pendingRun: RunSnapshot | null = null;
  /** Флаги remote config (приходят при загрузке; до того — значения по умолчанию). */
  flags: GameFlags = defaultFlags();
  t: Translate = createTranslator('ru');
  private saveManager: SaveManager | null = null;
  /** Что последним сказали площадке о стики-баннере (null — ещё ничего). */
  private bannerShown: boolean | null = null;

  constructor(platform: Platform, viewport: Viewport, reducedMotion: boolean) {
    this.platform = platform;
    this.viewport = viewport;
    this.reducedMotion = reducedMotion;
    this.ads = new AdService({
      platform,
      pause: this.pause,
      noAds: () => this.saveLoaded && this.save.data.purchases.noAds,
      completedRuns: () => (this.saveLoaded ? this.save.data.stats.runs : 0),
      cooldownSec: () => this.flags.interstitialCooldownSec,
    });
    this.purchases = new PurchaseService({
      platform,
      save: () => this.save,
      onGranted: () => this.syncBanner(),
    });
  }

  get layout(): Layout {
    return this.viewport.current;
  }

  /** Сохранения. Доступны после сцены Preload. */
  get save(): SaveManager {
    if (!this.saveManager) throw new Error('Сохранения ещё не загружены');
    return this.saveManager;
  }

  get saveLoaded(): boolean {
    return this.saveManager !== null;
  }

  setSave(manager: SaveManager): void {
    this.saveManager = manager;
  }

  setLang(lang: Lang): void {
    this.lang = lang;
    this.t = createTranslator(lang);
  }

  /** Немедленно отправить отложенные сохранения (пауза, скрытие вкладки). */
  flushSaves(): void {
    this.saveManager?.flush();
  }

  /**
   * Стики-баннер (через API SDK): показан всем, кроме купивших «Без рекламы» (п. 1.13.5).
   * Вызывается, когда меню готово, и после покупок.
   */
  syncBanner(): void {
    if (!this.saveLoaded) return;
    const visible = !this.save.data.purchases.noAds;
    if (visible === this.bannerShown) return;
    this.bannerShown = visible;
    this.platform.setBannerVisible(visible);
  }
}

export function getContext(game: Phaser.Game): GameContext {
  const ctx = game.registry.get(CONTEXT_KEY) as GameContext | undefined;
  if (!ctx) throw new Error('GameContext не установлен');
  return ctx;
}
