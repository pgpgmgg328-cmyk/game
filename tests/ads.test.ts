import { describe, expect, it, vi } from 'vitest';
import { canShowInterstitial } from '../src/core/ads/interstitial';
import { PauseController } from '../src/core/pause/PauseController';
import { AdService } from '../src/game/AdService';
import type { RewardedResult } from '../src/platform';

const base = { noAds: false, completedRuns: 3, nowMs: 100_000, lastAdAtMs: null, cooldownSec: 90 };

describe('когда можно показать полноэкранную рекламу', () => {
  it('после третьего доигранного забега — можно', () => {
    expect(canShowInterstitial(base)).toBe(true);
  });

  it('не в первые два забега нового игрока', () => {
    expect(canShowInterstitial({ ...base, completedRuns: 0 })).toBe(false);
    expect(canShowInterstitial({ ...base, completedRuns: 2 })).toBe(false);
  });

  it('никогда после покупки «Без рекламы»', () => {
    expect(canShowInterstitial({ ...base, noAds: true, completedRuns: 50 })).toBe(false);
  });

  it('не чаще раза в interstitialCooldownSec', () => {
    expect(canShowInterstitial({ ...base, lastAdAtMs: 100_000 - 89_999 })).toBe(false);
    expect(canShowInterstitial({ ...base, lastAdAtMs: 100_000 - 90_000 })).toBe(true);
    expect(canShowInterstitial({ ...base, lastAdAtMs: 100_000 - 30_000, cooldownSec: 30 })).toBe(
      true,
    );
  });
});

function setup(options: { runs?: number; noAds?: boolean } = {}) {
  let now = 1_000_000;
  const pause = new PauseController();
  const muted: boolean[] = [];
  pause.subscribe({ onAudioMutedChange: (value) => muted.push(value) });
  let finishInterstitial: (shown: boolean) => void = () => undefined;
  let finishRewarded: (result: RewardedResult) => void = () => undefined;
  let rewardCallback: () => void = () => undefined;
  const platform = {
    showInterstitial: vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finishInterstitial = resolve;
        }),
    ),
    showRewarded: vi.fn(
      (onRewarded: () => void) =>
        new Promise<RewardedResult>((resolve) => {
          rewardCallback = onRewarded;
          finishRewarded = resolve;
        }),
    ),
  };
  const ads = new AdService({
    platform,
    pause,
    noAds: () => options.noAds ?? false,
    completedRuns: () => options.runs ?? 5,
    cooldownSec: () => 90,
    now: () => now,
  });
  return {
    ads,
    pause,
    platform,
    muted,
    advance: (ms: number) => {
      now += ms;
    },
    finishInterstitial: (shown: boolean) => finishInterstitial(shown),
    finishRewarded: (result: RewardedResult) => finishRewarded(result),
    reward: () => rewardCallback(),
  };
}

describe('AdService', () => {
  it('на время рекламы игра на паузе и без звука, потом всё возвращается', async () => {
    const { ads, pause, muted, finishInterstitial } = setup();
    const shown = ads.interstitial();
    expect(pause.isPaused).toBe(true);
    expect(pause.isAudioMuted).toBe(true);
    expect(ads.busy).toBe(true);
    finishInterstitial(true);
    await expect(shown).resolves.toBe(true);
    expect(pause.isPaused).toBe(false);
    expect(muted).toEqual([true, false]);
    expect(ads.busy).toBe(false);
  });

  it('пауза между показами считается от показанной рекламы', async () => {
    const { ads, platform, advance, finishInterstitial } = setup();
    const first = ads.interstitial();
    finishInterstitial(true);
    await first;
    advance(60_000);
    await expect(ads.interstitial()).resolves.toBe(false);
    advance(30_000);
    const third = ads.interstitial();
    finishInterstitial(false);
    await expect(third).resolves.toBe(false);
    // Платформа рекламу не показала — паузы нет, можно пробовать снова.
    const fourth = ads.interstitial();
    finishInterstitial(true);
    await expect(fourth).resolves.toBe(true);
    expect(platform.showInterstitial).toHaveBeenCalledTimes(3);
  });

  it('правила не пускают — площадку даже не спрашиваем', async () => {
    const fresh = setup({ runs: 2 });
    await expect(fresh.ads.interstitial()).resolves.toBe(false);
    const paid = setup({ noAds: true });
    await expect(paid.ads.interstitial()).resolves.toBe(false);
    expect(fresh.platform.showInterstitial).not.toHaveBeenCalled();
    expect(paid.platform.showInterstitial).not.toHaveBeenCalled();
    expect(fresh.pause.isPaused).toBe(false);
  });

  it('за награду: награда из onRewarded, после — пауза для полноэкранной', async () => {
    const { ads, pause, reward, finishRewarded, advance } = setup({ noAds: true });
    let coins = 0;
    const result = ads.rewarded(() => {
      coins += 100;
    });
    expect(pause.isPaused).toBe(true);
    reward();
    expect(coins).toBe(100);
    finishRewarded('rewarded');
    await expect(result).resolves.toBe('rewarded');
    expect(pause.isPaused).toBe(false);
    // «Без рекламы» не убирает рекламу за награду: она по желанию игрока.
    advance(1000);
    expect(ads.busy).toBe(false);
  });

  it('пока идёт одна реклама, вторая не начинается', async () => {
    const { ads, platform, finishRewarded } = setup();
    const first = ads.rewarded(() => undefined);
    await expect(ads.rewarded(() => undefined)).resolves.toBe('error');
    await expect(ads.interstitial()).resolves.toBe(false);
    finishRewarded('closed');
    await expect(first).resolves.toBe('closed');
    expect(platform.showRewarded).toHaveBeenCalledTimes(1);
    expect(platform.showInterstitial).not.toHaveBeenCalled();
  });

  it('после рекламы за награду полноэкранная ждёт паузу', async () => {
    const { ads, finishRewarded, advance, finishInterstitial } = setup();
    const video = ads.rewarded(() => undefined);
    finishRewarded('rewarded');
    await video;
    expect(ads.interstitialAllowed).toBe(false);
    advance(90_000);
    expect(ads.interstitialAllowed).toBe(true);
    const shown = ads.interstitial();
    finishInterstitial(true);
    await expect(shown).resolves.toBe(true);
  });

  it('ошибка площадки не оставляет игру на паузе', async () => {
    const { ads, pause, platform } = setup();
    platform.showRewarded.mockRejectedValueOnce(new Error('сбой'));
    await expect(ads.rewarded(() => undefined)).resolves.toBe('error');
    expect(pause.isPaused).toBe(false);
    expect(ads.busy).toBe(false);
  });
});
