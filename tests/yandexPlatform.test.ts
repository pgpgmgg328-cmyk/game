import type { SDK } from 'ysdk';
import { describe, expect, it, vi } from 'vitest';
import { createDefaultSave, type Save } from '../src/core/save/schema';
import { SAVE_STORAGE_KEY } from '../src/platform/localCache';
import { YandexPlatform, type YaGamesGlobal } from '../src/platform/YandexPlatform';
import { FakeClock, flushPromises } from './fakeClock';
import { MemoryStorage } from './memoryStorage';

type Listener = () => void;

/** Поддельный SDK: записывает вызовы и позволяет прислать события платформы. */
function createFakeSdk(options: { lang?: string; device?: string; cloud?: unknown } = {}) {
  const calls: string[] = [];
  const listeners: Record<string, Set<Listener>> = {
    game_api_pause: new Set(),
    game_api_resume: new Set(),
  };
  let cloudData: unknown = options.cloud ?? {};
  const player = {
    getData: vi.fn(async () => cloudData),
    setData: vi.fn(async (data: unknown, flush?: boolean) => {
      calls.push(`setData(flush=${String(flush)})`);
      cloudData = data;
    }),
    isAuthorized: () => false,
  };
  const sdk = {
    environment: { i18n: { lang: options.lang ?? 'ru' } },
    deviceInfo: { type: options.device ?? 'desktop' },
    features: {
      LoadingAPI: { ready: () => calls.push('LoadingAPI.ready') },
      GameplayAPI: {
        start: () => calls.push('GameplayAPI.start'),
        stop: () => calls.push('GameplayAPI.stop'),
      },
    },
    on: (event: string, listener: Listener) => {
      listeners[event]?.add(listener);
      return () => listeners[event]?.delete(listener);
    },
    getPlayer: vi.fn(async () => player),
  };
  const yaGames: YaGamesGlobal = { init: vi.fn(async () => sdk as unknown as SDK) };
  return {
    yaGames,
    sdk,
    player,
    calls,
    emit: (event: string) => listeners[event]?.forEach((listener) => listener()),
    get cloudData() {
      return cloudData;
    },
  };
}

async function setup(fake = createFakeSdk(), storage: MemoryStorage | null = new MemoryStorage()) {
  const clock = new FakeClock();
  const platform = new YandexPlatform({ yaGames: fake.yaGames, storage, clock });
  await platform.init();
  return { platform, fake, clock, storage };
}

const save = (rev: number): Save => ({ ...createDefaultSave(), rev });

describe('YandexPlatform', () => {
  it('берёт язык и тип устройства из SDK', async () => {
    const { platform } = await setup(createFakeSdk({ lang: 'kk', device: 'mobile' }));
    expect(platform.kind).toBe('yandex');
    expect(platform.lang).toBe('kk');
    expect(platform.deviceType).toBe('mobile');
  });

  it('незнакомый тип устройства считает десктопом', async () => {
    const { platform } = await setup(createFakeSdk({ device: 'холодильник' }));
    expect(platform.deviceType).toBe('desktop');
  });

  it('вызывает LoadingAPI.ready только один раз', async () => {
    const { platform, fake } = await setup();
    platform.ready();
    platform.ready();
    expect(fake.calls).toEqual(['LoadingAPI.ready']);
  });

  it('размечает геймплей через GameplayAPI', async () => {
    const { platform, fake } = await setup();
    platform.gameplayStart();
    platform.gameplayStop();
    expect(fake.calls).toEqual(['GameplayAPI.start', 'GameplayAPI.stop']);
  });

  it('передаёт game_api_pause и game_api_resume подписчикам, отписка работает', async () => {
    const { platform, fake } = await setup();
    const events: string[] = [];
    const offPause = platform.onPause(() => events.push('pause'));
    platform.onResume(() => events.push('resume'));
    fake.emit('game_api_pause');
    fake.emit('game_api_resume');
    offPause();
    fake.emit('game_api_pause');
    expect(events).toEqual(['pause', 'resume']);
  });

  it('читает облако и локальный кэш', async () => {
    const storage = new MemoryStorage();
    storage.items.set(SAVE_STORAGE_KEY, JSON.stringify(save(2)));
    const { platform } = await setup(createFakeSdk({ cloud: save(5) }), storage);
    expect(await platform.loadSave()).toEqual({ cloud: save(5), local: save(2) });
  });

  it('пустое облако нового игрока считает отсутствием сохранения', async () => {
    const { platform } = await setup(createFakeSdk({ cloud: {} }));
    expect(await platform.loadSave()).toEqual({ cloud: null, local: null });
  });

  it('пишет локальный кэш сразу, а облако — через секунду и с flush', async () => {
    const { platform, fake, clock, storage } = await setup();
    await platform.loadSave();
    platform.persist(save(1), 'normal');
    expect(JSON.parse(storage?.items.get(SAVE_STORAGE_KEY) ?? 'null')).toEqual(save(1));
    expect(fake.player.setData).not.toHaveBeenCalled();
    clock.advance(1000);
    expect(fake.player.setData).toHaveBeenCalledWith(save(1), true);
  });

  it('отправляет в облако самое свежее сохранение', async () => {
    const { platform, fake, clock } = await setup();
    await platform.loadSave();
    platform.persist(save(1), 'normal');
    platform.persist(save(2), 'normal');
    clock.advance(1000);
    expect(fake.player.setData).toHaveBeenCalledTimes(1);
    expect(fake.cloudData).toEqual(save(2));
  });

  it('срочное сохранение и flush отправляют сразу', async () => {
    const { platform, fake } = await setup();
    await platform.loadSave();
    platform.persist(save(1), 'urgent');
    expect(fake.player.setData).toHaveBeenCalledTimes(1);
    await flushPromises();
    platform.persist(save(2), 'normal');
    platform.flush();
    expect(fake.player.setData).toHaveBeenCalledTimes(2);
    expect(fake.cloudData).toEqual(save(2));
  });

  it('если SDK не запустился, игра работает на локальном кэше', async () => {
    const storage = new MemoryStorage();
    const yaGames: YaGamesGlobal = {
      init: () => Promise.reject(new Error('SDK недоступен')),
    };
    const platform = new YandexPlatform({ yaGames, storage, clock: new FakeClock() });
    await expect(platform.init()).resolves.toBeUndefined();
    expect(() => {
      platform.ready();
      platform.gameplayStart();
      platform.gameplayStop();
      platform.flush();
    }).not.toThrow();
    platform.persist(save(3), 'urgent');
    expect(await platform.loadSave()).toEqual({ cloud: null, local: save(3) });
  });

  it('если облако не отвечает, берёт только локальный кэш и не пишет в облако', async () => {
    const fake = createFakeSdk();
    fake.sdk.getPlayer.mockRejectedValue(new Error('сеть'));
    const { platform, clock } = await setup(fake);
    expect(await platform.loadSave()).toEqual({ cloud: null, local: null });
    platform.persist(save(1), 'urgent');
    clock.advance(10_000);
    expect(fake.player.setData).not.toHaveBeenCalled();
  });

  it('ошибка чтения облака не мешает старту', async () => {
    const fake = createFakeSdk();
    fake.player.getData.mockRejectedValue(new Error('сеть'));
    const { platform } = await setup(fake);
    expect(await platform.loadSave()).toEqual({ cloud: null, local: null });
  });

  it('исключение внутри SDK не ломает игру', async () => {
    const fake = createFakeSdk();
    fake.sdk.features.GameplayAPI.start = () => {
      throw new Error('сбой SDK');
    };
    const { platform } = await setup(fake);
    expect(() => platform.gameplayStart()).not.toThrow();
  });
});
