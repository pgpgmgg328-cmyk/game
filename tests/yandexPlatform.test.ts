import type { SDK } from 'ysdk';
import { describe, expect, it, vi } from 'vitest';
import { createDefaultSave, type Save } from '../src/core/save/schema';
import { SAVE_STORAGE_KEY } from '../src/platform/localCache';
import { YandexPlatform, type YaGamesGlobal } from '../src/platform/YandexPlatform';
import { FakeClock, flushPromises } from './fakeClock';
import { MemoryStorage } from './memoryStorage';

type Listener = () => void;

interface AdCallbacks {
  onOpen?: () => void;
  onClose?: (wasShown?: boolean) => void;
  onError?: (error: unknown) => void;
  onRewarded?: () => void;
}

interface FakeEntry {
  rank: number;
  score: number;
  player: { uniqueID: string; publicName: string };
}

/** Поддельный SDK: записывает вызовы и позволяет прислать события платформы. */
function createFakeSdk(
  options: { lang?: string; device?: string; cloud?: unknown; authorized?: boolean } = {},
) {
  const calls: string[] = [];
  const listeners: Record<string, Set<Listener>> = {};
  let cloudData: unknown = options.cloud ?? {};
  let authorized = options.authorized ?? false;
  let fullscreen: AdCallbacks = {};
  let rewarded: AdCallbacks = {};
  const player = {
    getData: vi.fn(async () => cloudData),
    setData: vi.fn(async (data: unknown, flush?: boolean) => {
      calls.push(`setData(flush=${String(flush)})`);
      cloudData = data;
    }),
    isAuthorized: () => authorized,
    getUniqueID: () => 'me',
  };
  const payments = {
    getCatalog: vi.fn(async () => [
      {
        id: 'no_ads',
        title: 'Без рекламы',
        description: '',
        imageURI: '',
        price: '99 YAN',
        priceValue: '99',
        priceCurrencyCode: 'YAN',
        getPriceCurrencyImage: (size: string) => `data:image/png;base64,${size}`,
      },
    ]),
    getPurchases: vi.fn(async (): Promise<unknown[]> => [
      { productID: 'coins_1000', purchaseToken: 't1' },
      { productID: 'no_ads', purchaseToken: '' },
    ]),
    purchase: vi.fn(async ({ id }: { id: string }) => ({
      productID: id,
      purchaseToken: `token-${id}`,
      developerPayload: '',
    })),
    consumePurchase: vi.fn(async (_token: string) => undefined),
  };
  let entries: FakeEntry[] = [
    { rank: 1, score: 9000, player: { uniqueID: 'a', publicName: 'Чужое имя' } },
    { rank: 2, score: 5000.7, player: { uniqueID: 'me', publicName: 'Я' } },
    { rank: 3, score: 100, player: { uniqueID: 'b', publicName: 'Ещё имя' } },
  ];
  const sdk = {
    environment: { i18n: { lang: options.lang ?? 'ru' } },
    deviceInfo: { type: options.device ?? 'desktop' },
    EVENTS: {
      ACCOUNT_SELECTION_DIALOG_OPENED: 'ACCOUNT_SELECTION_DIALOG_OPENED',
      ACCOUNT_SELECTION_DIALOG_CLOSED: 'ACCOUNT_SELECTION_DIALOG_CLOSED',
    },
    features: {
      LoadingAPI: { ready: () => calls.push('LoadingAPI.ready') },
      GameplayAPI: {
        start: () => calls.push('GameplayAPI.start'),
        stop: () => calls.push('GameplayAPI.stop'),
      },
    },
    adv: {
      showFullscreenAdv: vi.fn((opts: { callbacks: AdCallbacks }) => {
        fullscreen = opts.callbacks;
      }),
      showRewardedVideo: vi.fn((opts: { callbacks: AdCallbacks }) => {
        rewarded = opts.callbacks;
      }),
      showBannerAdv: vi.fn(async () => ({ stickyAdvIsShowing: true })),
      hideBannerAdv: vi.fn(async () => ({ stickyAdvIsShowing: false })),
    },
    auth: {
      openAuthDialog: vi.fn(async () => {
        authorized = true;
      }),
    },
    leaderboards: {
      setScore: vi.fn(async (_name: string, _score: number) => undefined),
      getEntries: vi.fn(async (_name: string, _opts: unknown) => ({
        entries,
        ranges: [],
        userRank: 0,
        leaderboard: {},
      })),
    },
    feedback: {
      canReview: vi.fn(async (): Promise<{ value: boolean; reason?: string }> => ({ value: true })),
      requestReview: vi.fn(async () => ({ feedbackSent: true })),
    },
    shortcut: {
      canShowPrompt: vi.fn(async () => ({ canShow: true })),
      showPrompt: vi.fn(async () => ({ outcome: 'accepted' })),
    },
    getFlags: vi.fn(async (params: { defaultFlags: Record<string, string> }) => ({
      ...params.defaultFlags,
      goldenChance: '0.05',
    })),
    isAvailableMethod: vi.fn(async (_name: string) => true),
    serverTime: vi.fn((): number => 1_790_000_000_000),
    getPayments: vi.fn(async () => payments),
    on: (event: string, listener: Listener) => {
      (listeners[event] ??= new Set()).add(listener);
      return () => listeners[event]?.delete(listener);
    },
    getPlayer: vi.fn(async () => player),
  };
  const yaGames: YaGamesGlobal = { init: vi.fn(async () => sdk as unknown as SDK) };
  return {
    yaGames,
    sdk,
    player,
    payments,
    calls,
    emit: (event: string) => listeners[event]?.forEach((listener) => listener()),
    get cloudData() {
      return cloudData;
    },
    get fullscreen() {
      return fullscreen;
    },
    get rewarded() {
      return rewarded;
    },
    setEntries(value: FakeEntry[]) {
      entries = value;
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

describe('YandexPlatform: реклама', () => {
  it('полноэкранная: ждёт закрытия и сообщает, была ли реклама показана', async () => {
    const { platform, fake, clock } = await setup();
    const shown = platform.showInterstitial();
    fake.fullscreen.onOpen?.();
    clock.advance(30_000);
    fake.fullscreen.onClose?.(true);
    await expect(shown).resolves.toBe(true);

    const skipped = platform.showInterstitial();
    fake.fullscreen.onClose?.(false);
    await expect(skipped).resolves.toBe(false);

    const failed = platform.showInterstitial();
    fake.fullscreen.onError?.(new Error('нет рекламы'));
    fake.fullscreen.onClose?.(false);
    await expect(failed).resolves.toBe(false);
  });

  it('если реклама не открылась за 8 с, игра продолжает, а поздние колбэки ничего не меняют', async () => {
    const { platform, fake, clock } = await setup();
    const shown = platform.showInterstitial();
    clock.advance(8000);
    await expect(shown).resolves.toBe(false);
    expect(() => fake.fullscreen.onClose?.(true)).not.toThrow();
  });

  it('за награду: награда только из onRewarded, итог — после закрытия', async () => {
    const { platform, fake } = await setup();
    const onRewarded = vi.fn();
    const result = platform.showRewarded(onRewarded);
    fake.rewarded.onOpen?.();
    expect(onRewarded).not.toHaveBeenCalled();
    fake.rewarded.onRewarded?.();
    fake.rewarded.onRewarded?.();
    expect(onRewarded).toHaveBeenCalledTimes(1);
    fake.rewarded.onClose?.();
    await expect(result).resolves.toBe('rewarded');
  });

  it('за награду: закрыта раньше — без награды, ошибка — «недоступна»', async () => {
    const { platform, fake } = await setup();
    const onRewarded = vi.fn();
    const closed = platform.showRewarded(onRewarded);
    fake.rewarded.onOpen?.();
    fake.rewarded.onClose?.();
    await expect(closed).resolves.toBe('closed');

    const failed = platform.showRewarded(onRewarded);
    fake.rewarded.onError?.(new Error('нет рекламы'));
    await expect(failed).resolves.toBe('error');

    fake.sdk.adv.showRewardedVideo.mockImplementationOnce(() => {
      throw new Error('сбой SDK');
    });
    await expect(platform.showRewarded(onRewarded)).resolves.toBe('error');
    expect(onRewarded).not.toHaveBeenCalled();
  });

  it('стики-баннер показывается и скрывается через API SDK, ошибки не мешают', async () => {
    const { platform, fake } = await setup();
    platform.setBannerVisible(true);
    platform.setBannerVisible(false);
    expect(fake.sdk.adv.showBannerAdv).toHaveBeenCalledTimes(1);
    expect(fake.sdk.adv.hideBannerAdv).toHaveBeenCalledTimes(1);
    fake.sdk.adv.showBannerAdv.mockRejectedValueOnce(new Error('ADV_IS_NOT_CONNECTED'));
    expect(() => platform.setBannerVisible(true)).not.toThrow();
    await flushPromises();
  });
});

describe('YandexPlatform: покупки', () => {
  it('каталог: цена и портальная валюта из SDK, покупки инициализируются один раз', async () => {
    const { platform, fake } = await setup();
    const catalog = await platform.getCatalog();
    expect(catalog).toEqual([
      {
        id: 'no_ads',
        priceValue: '99',
        currencyCode: 'YAN',
        currencyImage: 'data:image/png;base64,medium',
      },
    ]);
    await platform.getPurchases();
    expect(fake.sdk.getPayments).toHaveBeenCalledTimes(1);
  });

  it('список покупок без битых записей, ошибка — null', async () => {
    const { platform, fake } = await setup();
    expect(await platform.getPurchases()).toEqual([{ productId: 'coins_1000', token: 't1' }]);
    fake.payments.getPurchases.mockRejectedValueOnce(new Error('PAYMENT_FAILURE'));
    expect(await platform.getPurchases()).toBeNull();
  });

  it('покупка и консумирование; закрытое окно оплаты — null', async () => {
    const { platform, fake } = await setup();
    expect(await platform.purchase('coins_1000')).toEqual({
      productId: 'coins_1000',
      token: 'token-coins_1000',
    });
    expect(fake.payments.purchase).toHaveBeenCalledWith({ id: 'coins_1000' });
    fake.payments.purchase.mockRejectedValueOnce(new Error('закрыл окно'));
    expect(await platform.purchase('coins_1000')).toBeNull();
    expect(await platform.consumePurchase('t1')).toBe(true);
    expect(fake.payments.consumePurchase).toHaveBeenCalledWith('t1');
    fake.payments.consumePurchase.mockRejectedValueOnce(new Error('сеть'));
    expect(await platform.consumePurchase('t1')).toBe(false);
  });

  it('если покупки не инициализировались, они недоступны, а позже пробуем снова', async () => {
    const { platform, fake } = await setup();
    fake.sdk.getPayments.mockRejectedValueOnce(new Error('покупки не подключены'));
    expect(await platform.getCatalog()).toBeNull();
    expect(await platform.getCatalog()).not.toBeNull();
    expect(fake.sdk.getPayments).toHaveBeenCalledTimes(2);
  });

  it('syncSave ждёт записи в облако, без облака — false', async () => {
    const { platform } = await setup();
    expect(await platform.syncSave(1000)).toBe(false);
    await platform.loadSave();
    platform.persist(save(1), 'urgent');
    await expect(platform.syncSave(1000)).resolves.toBe(true);
  });
});

describe('YandexPlatform: игрок и рекорды', () => {
  it('вход: окно входа, затем новый игрок и его облако', async () => {
    const { platform, fake } = await setup();
    await platform.loadSave();
    expect(platform.authorized).toBe(false);
    expect(platform.canAuthorize).toBe(true);
    expect(await platform.openAuthDialog()).toBe(true);
    await platform.loadSave();
    expect(fake.sdk.getPlayer).toHaveBeenCalledTimes(2);
    expect(platform.authorized).toBe(true);
    expect(platform.canAuthorize).toBe(false);
    fake.sdk.auth.openAuthDialog.mockRejectedValueOnce(new Error('закрыл окно'));
    expect(await platform.openAuthDialog()).toBe(false);
  });

  it('окно выбора аккаунта: подписчики знают о нём, облачные записи ждут перечитывания', async () => {
    const { platform, fake, clock } = await setup();
    await platform.loadSave();
    const events: boolean[] = [];
    platform.onAccountSelection((open) => events.push(open));
    fake.emit('ACCOUNT_SELECTION_DIALOG_OPENED');
    platform.persist(save(1), 'urgent');
    clock.advance(5000);
    expect(fake.player.setData).not.toHaveBeenCalled();
    fake.emit('ACCOUNT_SELECTION_DIALOG_CLOSED');
    expect(events).toEqual([true, false]);
    // Перечитали прогресс: старые изменения в облако выбранного аккаунта не уходят.
    await platform.loadSave();
    clock.advance(5000);
    expect(fake.player.setData).not.toHaveBeenCalled();
    platform.persist(save(2), 'urgent');
    expect(fake.player.setData).toHaveBeenCalledWith(save(2), true);
  });

  it('рекорд уходит только вошедшему игроку и не чаще раза в секунду', async () => {
    const { platform, fake, clock } = await setup();
    await platform.loadSave();
    expect(await platform.submitScore(500)).toBe(false);
    expect(fake.sdk.leaderboards.setScore).not.toHaveBeenCalled();

    await platform.openAuthDialog();
    await platform.loadSave();
    expect(await platform.submitScore(1234.9)).toBe(true);
    expect(fake.sdk.isAvailableMethod).toHaveBeenCalledWith('leaderboards.setScore');
    expect(fake.sdk.leaderboards.setScore).toHaveBeenCalledWith('bestScore', 1234);

    const second = platform.submitScore(2000);
    await flushPromises();
    expect(fake.sdk.leaderboards.setScore).toHaveBeenCalledTimes(1);
    clock.advance(1100);
    await expect(second).resolves.toBe(true);
    expect(fake.sdk.leaderboards.setScore).toHaveBeenCalledTimes(2);

    fake.sdk.isAvailableMethod.mockResolvedValueOnce(false);
    expect(await platform.submitScore(3000)).toBe(false);
  });

  it('таблица: места и очки без имён, своя строка, кеш на 30 с', async () => {
    const { platform, fake, clock } = await setup(createFakeSdk({ authorized: true }));
    await platform.loadSave();
    const data = await platform.getLeaderboard();
    expect(data?.top.map((row) => [row.rank, row.score, row.self])).toEqual([
      [1, 9000, false],
      [2, 5000, true],
      [3, 100, false],
    ]);
    expect(data?.player?.rank).toBe(2);
    expect(JSON.stringify(data)).not.toContain('имя');
    expect(fake.sdk.leaderboards.getEntries).toHaveBeenCalledWith('bestScore', {
      quantityTop: 10,
      includeUser: true,
      quantityAround: 1,
    });

    await platform.getLeaderboard();
    expect(fake.sdk.leaderboards.getEntries).toHaveBeenCalledTimes(1);
    clock.advance(30_000);
    fake.setEntries([{ rank: 15, score: 7, player: { uniqueID: 'me', publicName: 'Я' } }]);
    const later = await platform.getLeaderboard();
    expect(later?.top).toEqual([]);
    expect(later?.player?.rank).toBe(15);
  });

  it('гость видит топ без своей строки; ошибка таблицы — null', async () => {
    const { platform, fake } = await setup();
    await platform.loadSave();
    const data = await platform.getLeaderboard();
    expect(data?.player).toBeNull();
    expect(fake.sdk.leaderboards.getEntries).toHaveBeenCalledWith('bestScore', {
      quantityTop: 10,
      includeUser: false,
    });
    const other = await setup();
    other.fake.sdk.leaderboards.getEntries.mockRejectedValueOnce(new Error('404'));
    expect(await other.platform.getLeaderboard()).toBeNull();
  });
});

describe('YandexPlatform: серверное время', () => {
  it('время — из ysdk.serverTime(), при сбое — время устройства', async () => {
    const { platform, fake, clock } = await setup();
    expect(platform.serverTime()).toBe(1_790_000_000_000);
    fake.sdk.serverTime.mockImplementationOnce(() => {
      throw new Error('нет');
    });
    expect(platform.serverTime()).toBe(clock.now());
    fake.sdk.serverTime.mockReturnValueOnce(Number.NaN);
    expect(platform.serverTime()).toBe(clock.now());
  });
});

describe('YandexPlatform: флаги, отзыв, ярлык', () => {
  it('флаги из SDK поверх значений по умолчанию', async () => {
    const { platform, fake } = await setup();
    const flags = await platform.getFlags({ goldenChance: '0.02', interstitialCooldownSec: '90' });
    expect(flags).toEqual({ goldenChance: '0.05', interstitialCooldownSec: '90' });
    expect(fake.sdk.getFlags).toHaveBeenCalledWith({
      defaultFlags: { goldenChance: '0.02', interstitialCooldownSec: '90' },
    });
  });

  it('флаги не пришли за 3 с или с ошибкой — значения по умолчанию', async () => {
    const { platform, fake, clock } = await setup();
    fake.sdk.getFlags.mockImplementationOnce(() => new Promise(() => undefined));
    const slow = platform.getFlags({ goldenChance: '0.02' });
    clock.advance(3000);
    await expect(slow).resolves.toEqual({ goldenChance: '0.02' });
    fake.sdk.getFlags.mockRejectedValueOnce(new Error('сеть'));
    await expect(platform.getFlags({ goldenChance: '0.02' })).resolves.toEqual({
      goldenChance: '0.02',
    });
  });

  it('отзыв: показан, уже оценили, нельзя сейчас', async () => {
    const { platform, fake } = await setup();
    expect(await platform.requestReview()).toBe('shown');
    expect(fake.sdk.feedback.requestReview).toHaveBeenCalledTimes(1);
    fake.sdk.feedback.canReview.mockResolvedValueOnce({ value: false, reason: 'GAME_RATED' });
    expect(await platform.requestReview()).toBe('done');
    fake.sdk.feedback.canReview.mockResolvedValueOnce({ value: false, reason: 'NO_AUTH' });
    expect(await platform.requestReview()).toBe('later');
    fake.sdk.feedback.canReview.mockRejectedValueOnce(new Error('сеть'));
    expect(await platform.requestReview()).toBe('later');
  });

  it('ярлык на рабочий стол', async () => {
    const { platform, fake } = await setup();
    expect(await platform.canAddShortcut()).toBe(true);
    expect(await platform.addShortcut()).toBe(true);
    fake.sdk.shortcut.showPrompt.mockResolvedValueOnce({ outcome: 'rejected' });
    expect(await platform.addShortcut()).toBe(false);
  });

  it('без SDK всё это недоступно, но ничего не ломается', async () => {
    const yaGames: YaGamesGlobal = { init: () => Promise.reject(new Error('нет SDK')) };
    const platform = new YandexPlatform({ yaGames, storage: null, clock: new FakeClock() });
    await platform.init();
    expect(await platform.showInterstitial()).toBe(false);
    expect(await platform.showRewarded(() => undefined)).toBe('error');
    expect(await platform.getCatalog()).toBeNull();
    expect(await platform.purchase('no_ads')).toBeNull();
    expect(platform.canAuthorize).toBe(false);
    expect(await platform.getLeaderboard()).toBeNull();
    expect(await platform.getFlags({ a: '1' })).toEqual({ a: '1' });
    expect(await platform.requestReview()).toBe('later');
    expect(await platform.canAddShortcut()).toBe(false);
    expect(() => platform.setBannerVisible(true)).not.toThrow();
  });
});
