import { canShowInterstitial } from '../core/ads/interstitial';
import type { PauseController } from '../core/pause/PauseController';
import type { Platform, RewardedResult } from '../platform';

/** Что сервису рекламы нужно знать об игре. Функции — потому что сохранение и флаги меняются. */
export interface AdServiceDeps {
  platform: Pick<Platform, 'showInterstitial' | 'showRewarded'>;
  pause: Pick<PauseController, 'setSystemPause'>;
  noAds: () => boolean;
  completedRuns: () => number;
  cooldownSec: () => number;
  now?: () => number;
}

/**
 * Показ рекламы (CLAUDE.md, «Реклама»): на время показа игра на паузе, звук выключен и разметка
 * геймплея остановлена (системная пауза «ad»). После закрытия или ошибки всё возвращается.
 * Одновременно идёт не больше одного показа.
 */
export class AdService {
  private readonly deps: AdServiceDeps;
  private readonly now: () => number;
  private lastAdAt: number | null = null;
  private showing = false;

  constructor(deps: AdServiceDeps) {
    this.deps = deps;
    this.now = deps.now ?? (() => Date.now());
  }

  /** Сейчас идёт показ рекламы. */
  get busy(): boolean {
    return this.showing;
  }

  /** Можно ли сейчас показать полноэкранную рекламу (без покупки, не в первых забегах, не часто). */
  get interstitialAllowed(): boolean {
    return canShowInterstitial({
      noAds: this.deps.noAds(),
      completedRuns: this.deps.completedRuns(),
      nowMs: this.now(),
      lastAdAtMs: this.lastAdAt,
      cooldownSec: this.deps.cooldownSec(),
    });
  }

  /**
   * Полноэкранная реклама в логической паузе, если правила разрешают. Выполняется, когда игру
   * можно продолжать: реклама закрыта, не открылась или не нужна. true — реклама была показана.
   */
  async interstitial(): Promise<boolean> {
    if (this.showing || !this.interstitialAllowed) return false;
    return this.during(false, async () => {
      const shown = await this.deps.platform.showInterstitial();
      if (shown) this.lastAdAt = this.now();
      return shown;
    });
  }

  /**
   * Реклама за награду. onRewarded вызывается только из колбэка onRewarded площадки:
   * там и выдаётся награда. Если реклама уже идёт, сразу 'error'.
   */
  async rewarded(onRewarded: () => void): Promise<RewardedResult> {
    if (this.showing) return 'error';
    return this.during<RewardedResult>('error', async () => {
      const result = await this.deps.platform.showRewarded(onRewarded);
      // После рекламы за награду полноэкранная тоже ждёт паузу: детям — не больше рекламы подряд.
      if (result !== 'error') this.lastAdAt = this.now();
      return result;
    });
  }

  /** Пауза и тишина на время показа; сбой площадки — как «реклама недоступна» (fallback). */
  private async during<T>(fallback: T, show: () => Promise<T>): Promise<T> {
    this.showing = true;
    this.deps.pause.setSystemPause('ad', true);
    try {
      return await show();
    } catch {
      return fallback;
    } finally {
      this.deps.pause.setSystemPause('ad', false);
      this.showing = false;
    }
  }
}
