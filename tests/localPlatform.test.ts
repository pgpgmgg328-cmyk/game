import { describe, expect, it } from 'vitest';
import { createDefaultSave } from '../src/core/save/schema';
import { RUN_STORAGE_KEY, SAVE_STORAGE_KEY, readJson, writeJson } from '../src/platform/localCache';
import { LOCAL_AD_MS, LocalPlatform } from '../src/platform/LocalPlatform';
import { FakeClock, flushPromises } from './fakeClock';
import { MemoryStorage } from './memoryStorage';

async function platformWith(storage: MemoryStorage | null) {
  const platform = new LocalPlatform({ storage, lang: 'ru', deviceType: 'mobile' });
  await platform.init();
  return platform;
}

describe('localCache', () => {
  it('записывает и читает JSON', () => {
    const storage = new MemoryStorage();
    expect(writeJson(storage, 'k', { a: 1 })).toBe(true);
    expect(readJson(storage, 'k')).toEqual({ a: 1 });
  });

  it('битый JSON и отсутствие ключа читаются как null', () => {
    const storage = new MemoryStorage();
    storage.items.set('k', '{не json');
    expect(readJson(storage, 'k')).toBeNull();
    expect(readJson(storage, 'нет такого')).toBeNull();
  });

  it('не бросает исключений, если хранилище сломано или его нет', () => {
    const storage = new MemoryStorage();
    storage.failReads = true;
    storage.failWrites = true;
    expect(readJson(storage, 'k')).toBeNull();
    expect(writeJson(storage, 'k', 1)).toBe(false);
    expect(readJson(null, 'k')).toBeNull();
    expect(writeJson(null, 'k', 1)).toBe(false);
  });
});

describe('LocalPlatform', () => {
  it('берёт язык и тип устройства из настроек', async () => {
    const platform = await platformWith(new MemoryStorage());
    expect(platform.kind).toBe('local');
    expect(platform.lang).toBe('ru');
    expect(platform.deviceType).toBe('mobile');
  });

  it('сохраняет в локальное хранилище и читает обратно', async () => {
    const storage = new MemoryStorage();
    const platform = await platformWith(storage);
    const save = { ...createDefaultSave(), rev: 3 };
    platform.persist(save);
    expect(JSON.parse(storage.items.get(SAVE_STORAGE_KEY) ?? 'null')).toEqual(save);
    expect(await platform.loadSave()).toEqual({ cloud: null, local: save });
  });

  it('без сохранения отдаёт пустые источники', async () => {
    const platform = await platformWith(new MemoryStorage());
    expect(await platform.loadSave()).toEqual({ cloud: null, local: null });
  });

  it('работает без хранилища: ничего не падает', async () => {
    const platform = await platformWith(null);
    expect(() => platform.persist(createDefaultSave())).not.toThrow();
    expect(await platform.loadSave()).toEqual({ cloud: null, local: null });
  });

  it('снимок забега пишется, читается и удаляется локально', async () => {
    const storage = new MemoryStorage();
    const platform = await platformWith(storage);
    expect(platform.loadRunSnapshot()).toBeNull();
    const snapshot = {
      v: 3 as const,
      world: 'classic',
      seed: 1,
      rng: 2,
      score: 30,
      elapsedMs: 5000,
      drops: 4,
      merges: 1,
      goldenMerges: 0,
      megas: 0,
      coins: 2,
      bestTier: 2,
      current: { tier: 1, golden: false },
      upcoming: [{ tier: 2, golden: false }],
      aimX: 300,
      modifiers: { jarWidth: 600, preview: 1, squishPower: 1, goldenChance: 0.02 },
      shakes: 0,
      removes: 0,
      adBonuses: { revive: false, shake: false, remove: false },
      keys: [],
    };
    platform.saveRunSnapshot(snapshot);
    expect(storage.items.has(RUN_STORAGE_KEY)).toBe(true);
    expect(platform.loadRunSnapshot()).toEqual(snapshot);
    platform.saveRunSnapshot(null);
    expect(storage.items.has(RUN_STORAGE_KEY)).toBe(false);
    storage.failWrites = true;
    expect(() => platform.saveRunSnapshot(null)).not.toThrow();
  });

  it('методы площадки можно вызывать сколько угодно раз', async () => {
    const platform = await platformWith(new MemoryStorage());
    expect(() => {
      platform.ready();
      platform.ready();
      platform.gameplayStart();
      platform.gameplayStop();
      platform.flush();
      platform.onPause(() => {})();
      platform.onResume(() => {})();
    }).not.toThrow();
  });
});

describe('LocalPlatform: реклама и функции площадки', () => {
  async function withClock() {
    const clock = new FakeClock();
    const platform = new LocalPlatform({ storage: null, lang: 'ru', deviceType: 'desktop', clock });
    await platform.init();
    return { platform, clock };
  }

  it('реклама — заглушка на 1 с, награда засчитывается', async () => {
    const { platform, clock } = await withClock();
    let rewarded = 0;
    const interstitial = platform.showInterstitial();
    const video = platform.showRewarded(() => {
      rewarded += 1;
    });
    clock.advance(LOCAL_AD_MS - 1);
    await flushPromises();
    expect(rewarded).toBe(0);
    clock.advance(1);
    await expect(interstitial).resolves.toBe(true);
    await expect(video).resolves.toBe('rewarded');
    expect(rewarded).toBe(1);
  });

  it('покупок, входа, рекордов, отзыва и ярлыка без Яндекса нет', async () => {
    const { platform } = await withClock();
    expect(await platform.getCatalog()).toBeNull();
    expect(await platform.getPurchases()).toBeNull();
    expect(await platform.purchase('no_ads')).toBeNull();
    expect(await platform.consumePurchase('t')).toBe(false);
    expect(await platform.syncSave(1000)).toBe(false);
    expect(platform.authorized).toBe(false);
    expect(platform.canAuthorize).toBe(false);
    expect(await platform.openAuthDialog()).toBe(false);
    expect(await platform.submitScore(10)).toBe(false);
    expect(await platform.getLeaderboard()).toBeNull();
    expect(await platform.requestReview()).toBe('later');
    expect(await platform.canAddShortcut()).toBe(false);
    expect(await platform.addShortcut()).toBe(false);
    expect(await platform.getFlags({ goldenChance: '0.02' })).toEqual({ goldenChance: '0.02' });
    expect(() => platform.setBannerVisible(true)).not.toThrow();
  });
});
