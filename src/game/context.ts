import type Phaser from 'phaser';
import { AudioEngine } from '../audio/AudioEngine';
import { defaultFlags, type GameFlags } from '../core/flags';
import { completeTask, dayNumber, rollDay, type TaskCompletion } from '../core/meta/daily';
import { applyRunOutcome, type RunOutcome, type RunOutcomeInput } from '../core/meta/progress';
import type { Layout } from '../core/layout';
import type { RunSnapshot } from '../core/run/snapshot';
import { PauseController } from '../core/pause/PauseController';
import { restoreAfterSignIn } from '../core/save/restore';
import { SaveManager } from '../core/save/SaveManager';
import type { Save } from '../core/save/schema';
import { createTranslator, type Lang, type Translate } from '../i18n';
import type { Platform } from '../platform';
import { THEMES, WORLD_SIZES } from '../themes';
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
  readonly audio = new AudioEngine(THEMES[0]!.music);
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

  /**
   * Итог забега — в сохранение и сразу в облако. Новый рекорд вошедшего игрока уходит в таблицу
   * рекордов (диздок, раздел 10); у гостя площадка его не примет.
   */
  recordRun(input: RunOutcomeInput): RunOutcome {
    let outcome: RunOutcome = { newRecord: false, coins: 0, bonus: 0 };
    this.save.update((draft) => {
      outcome = applyRunOutcome(draft, input);
    }, 'urgent');
    if (outcome.newRecord) void this.platform.submitScore(this.save.data.stats.bestScore);
    return outcome;
  }

  /** Номер сегодняшнего дня игрока: серверное время и часовой пояс устройства (core/meta/daily.ts). */
  today(): number {
    return dayNumber(this.platform.serverTime(), new Date().getTimezoneOffset());
  }

  /** Наступил новый день — новое задание и подарки (сохраняется сразу). Возвращает сегодняшний день. */
  rollDaily(): number {
    const day = this.today();
    if (!this.saveLoaded) return day;
    const saved = this.save.data.daily.day;
    if (day > saved || saved > day + 2) {
      this.save.update((draft) => {
        rollDay(draft, WORLD_SIZES, day);
      });
    }
    return day;
  }

  /**
   * Слияние вырастило форму tier в мире world: если это «Клавиша дня» — награда и серия дней
   * (сохраняется сразу). null — задание не про это.
   */
  completeDailyTask(world: string, tier: number): TaskCompletion | null {
    const day = this.rollDaily();
    const { daily } = this.save.data;
    if (daily.taskDone || !daily.task || daily.task.world !== world || tier < daily.task.tier) {
      return null;
    }
    let done: TaskCompletion | null = null;
    this.save.update((draft) => {
      done = completeTask(draft, day, world, tier);
    }, 'urgent');
    return done;
  }

  /** Немедленно отправить отложенные сохранения (пауза, скрытие вкладки). */
  flushSaves(): void {
    this.saveManager?.flush();
  }

  /**
   * Вход в Яндекс ID по кнопке (п. 1.2.1). Перед входом прогресс гостя уходит в облако: если
   * у аккаунта прогресса нет, платформа перенесёт этот. true — игрок вошёл.
   */
  async signIn(): Promise<boolean> {
    if (!this.platform.canAuthorize) return this.platform.authorized;
    this.flushSaves();
    await this.platform.syncSave(3000);
    if (!(await this.platform.openAuthDialog())) return false;
    await this.reloadProgress();
    return this.platform.authorized;
  }

  /**
   * Перечитать прогресс после входа или выбора аккаунта (docs/yandex/sdk/sdk-events.md):
   * облако аккаунта важнее локального кэша. Выбранный прогресс сразу записывается и в облако,
   * и в кэш, чтобы старые данные гостя его не перебили. Покупки и рекорд — тоже заново.
   */
  async reloadProgress(): Promise<void> {
    if (!this.saveManager) return;
    const current = JSON.parse(JSON.stringify(this.saveManager.data)) as Save;
    const sources = await this.platform.loadSave();
    const restored = restoreAfterSignIn(sources.cloud, current);
    this.saveManager = new SaveManager(restored, this.platform);
    this.saveManager.update(() => undefined, 'urgent');
    this.audio.setSettings(this.saveManager.data.settings);
    this.bannerShown = null;
    this.syncBanner();
    void this.purchases.restore();
    // Рекорд — в таблицу сразу после входа: экран рекордов покажет его уже в свежей таблице.
    const best = this.saveManager.data.stats.bestScore;
    if (this.platform.authorized && best > 0) await this.platform.submitScore(best);
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
