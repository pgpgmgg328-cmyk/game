import { describe, expect, it } from 'vitest';
import { createDefaultSave } from '../src/core/save/schema';
import { RUN_STORAGE_KEY, SAVE_STORAGE_KEY, readJson, writeJson } from '../src/platform/localCache';
import { LocalPlatform } from '../src/platform/LocalPlatform';
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
      v: 1 as const,
      world: 'classic',
      seed: 1,
      rng: 2,
      score: 30,
      elapsedMs: 5000,
      drops: 4,
      merges: 1,
      bestTier: 2,
      current: 1,
      upcoming: [2],
      aimX: 300,
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
