import type { LeaderboardEntry, Payments, Player, Purchase, SDK } from 'ysdk';
import { LEADERBOARD } from '../config/leaderboard';
import {
  CloudWriteScheduler,
  type CloudWriteOptions,
  type SchedulerClock,
} from '../core/save/CloudWriteScheduler';
import type { RunSnapshot } from '../core/run/snapshot';
import type { SaveSources } from '../core/save/restore';
import type { SaveUrgency } from '../core/save/SaveManager';
import type { Save } from '../core/save/schema';
import {
  RUN_STORAGE_KEY,
  SAVE_STORAGE_KEY,
  browserStorage,
  readJson,
  removeItem,
  writeJson,
  type StorageLike,
} from './localCache';
import type {
  CatalogProduct,
  DeviceType,
  LeaderboardData,
  LeaderboardRow,
  OwnedPurchase,
  Platform,
  ReviewResult,
  RewardedResult,
} from './Platform';

/** Глобальный объект, который создаёт скрипт /sdk.js. */
export interface YaGamesGlobal {
  init(): Promise<SDK>;
}

export interface YandexPlatformOptions {
  yaGames: YaGamesGlobal;
  /** Локальный кэш сохранений. По умолчанию — localStorage (для игр из архива SDK делает его надёжным). */
  storage?: StorageLike | null;
  clock?: SchedulerClock;
  cloudWriteOptions?: CloudWriteOptions;
}

const DEVICE_TYPES: readonly DeviceType[] = ['desktop', 'mobile', 'tablet', 'tv'];

/**
 * Реклама, которая не открылась за это время, считается недоступной: игра не должна стоять
 * на паузе бесконечно, если SDK не ответил (п. 4.4 требует начинать показ за 2 с).
 */
const AD_OPEN_TIMEOUT_MS = 8000;
/** Флаги ждём недолго: без них игра стартует со значениями по умолчанию. */
const FLAGS_TIMEOUT_MS = 3000;
/** setScore — не чаще раза в секунду (docs/yandex/sdk/sdk-leaderboard.md); берём с запасом. */
const SCORE_INTERVAL_MS = 1100;
/** getEntries — не больше 20 запросов за 5 минут, поэтому таблица кешируется на 30 с. */
const LEADERBOARD_CACHE_MS = 30_000;
/** Окно выбора аккаунта (docs/yandex/sdk/sdk-events.md); имена — на случай SDK без EVENTS. */
const ACCOUNT_DIALOG_OPENED = 'ACCOUNT_SELECTION_DIALOG_OPENED';
const ACCOUNT_DIALOG_CLOSED = 'ACCOUNT_SELECTION_DIALOG_CLOSED';
/** Причины canReview, после которых просить оценку больше не нужно. */
const REVIEW_DONE_REASONS = new Set([
  'GAME_RATED',
  'REVIEW_ALREADY_REQUESTED',
  'REVIEW_WAS_REQUESTED',
]);

const realClock: SchedulerClock = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
  clearTimeout: (handle) => window.clearTimeout(handle as number),
};

function browserLang(): string {
  return typeof navigator === 'undefined' ? '' : (navigator.language ?? '');
}

function isEmptyObject(value: unknown): boolean {
  return typeof value === 'object' && value !== null && Object.keys(value).length === 0;
}

/** Постоянное 32-битное число из строки (FNV-1a): картинка строки таблицы без имени игрока. */
function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function toOwned(purchase: Purchase | null | undefined): OwnedPurchase | null {
  if (!purchase || typeof purchase.productID !== 'string') return null;
  if (typeof purchase.purchaseToken !== 'string' || purchase.purchaseToken === '') return null;
  return { productId: purchase.productID, token: purchase.purchaseToken };
}

function currencyImage(product: { getPriceCurrencyImage(size: 'medium'): string }): string {
  try {
    const url = product.getPriceCurrencyImage('medium');
    return typeof url === 'string' ? url : '';
  } catch {
    return '';
  }
}

/**
 * Единственное место, где вызывается SDK Яндекс Игр (docs/yandex/sdk/).
 * Ошибки SDK не ломают игру: без SDK она работает на локальном кэше, без рекламы и покупок.
 */
export class YandexPlatform implements Platform {
  readonly kind = 'yandex' as const;
  lang = '';
  deviceType: DeviceType = 'desktop';

  private readonly options: YandexPlatformOptions;
  private readonly clock: SchedulerClock;
  private readonly cloud: CloudWriteScheduler;
  private readonly pauseListeners = new Set<() => void>();
  private readonly resumeListeners = new Set<() => void>();
  private readonly accountListeners = new Set<(open: boolean) => void>();
  private sdk: SDK | null = null;
  private player: Player | null = null;
  private paymentsRequest: Promise<Payments | null> | null = null;
  private storage: StorageLike | null = null;
  private latestSave: Save | null = null;
  private readyCalled = false;
  private scoreQueue: Promise<unknown> = Promise.resolve();
  private lastScoreAt = Number.NEGATIVE_INFINITY;
  private leaderboardCache: { at: number; data: LeaderboardData } | null = null;

  constructor(options: YandexPlatformOptions) {
    this.options = options;
    this.clock = options.clock ?? realClock;
    this.cloud = new CloudWriteScheduler(
      () => this.writeCloud(),
      this.clock,
      options.cloudWriteOptions,
    );
  }

  async init(): Promise<void> {
    this.storage = this.options.storage !== undefined ? this.options.storage : browserStorage();
    this.lang = browserLang();
    try {
      const sdk = await this.options.yaGames.init();
      this.sdk = sdk;
      // Подписываемся сразу: платформа показывает рекламу на старте всех игр,
      // и о ней игра узнаёт только по game_api_pause / game_api_resume (docs/yandex/sdk/sdk-events.md).
      sdk.on('game_api_pause', () => this.pauseListeners.forEach((listener) => listener()));
      sdk.on('game_api_resume', () => this.resumeListeners.forEach((listener) => listener()));
      this.listenAccountSelection(sdk);
      this.lang = sdk.environment.i18n.lang;
      const type = sdk.deviceInfo.type as string;
      this.deviceType = DEVICE_TYPES.find((known) => known === type) ?? 'desktop';
    } catch {
      this.sdk = null;
    }
  }

  ready(): void {
    if (this.readyCalled || !this.sdk) return;
    this.readyCalled = true;
    this.callSdk((sdk) => sdk.features.LoadingAPI?.ready());
  }

  gameplayStart(): void {
    this.callSdk((sdk) => sdk.features.GameplayAPI?.start());
  }

  gameplayStop(): void {
    this.callSdk((sdk) => sdk.features.GameplayAPI?.stop());
  }

  onPause(listener: () => void): () => void {
    this.pauseListeners.add(listener);
    return () => {
      this.pauseListeners.delete(listener);
    };
  }

  onResume(listener: () => void): () => void {
    this.resumeListeners.add(listener);
    return () => {
      this.resumeListeners.delete(listener);
    };
  }

  // ── Сохранения ──────────────────────────────────────────────────────────────────────────

  async loadSave(): Promise<SaveSources> {
    // Игрок мог смениться (вход, выбор аккаунта): неотправленные данные прежнего игрока
    // в облако нового не пишем, кеш таблицы рекордов тоже устарел.
    this.cloud.reset();
    this.latestSave = null;
    this.leaderboardCache = null;
    const local = readJson(this.storage, SAVE_STORAGE_KEY);
    let cloud: unknown = null;
    if (this.sdk) {
      this.player = null;
      try {
        // Лимит getPlayer — 20 запросов за 5 минут: игрок запрашивается при старте и после входа.
        this.player = await this.sdk.getPlayer();
        const data: unknown = await this.player.getData();
        // У нового игрока облако отдаёт пустой объект: это «сохранения нет», а не битые данные.
        cloud = isEmptyObject(data) ? null : data;
      } catch {
        cloud = null;
      }
    }
    return { cloud, local };
  }

  persist(save: Save, urgency: SaveUrgency): void {
    this.latestSave = save;
    writeJson(this.storage, SAVE_STORAGE_KEY, save);
    if (this.player) this.cloud.request(urgency === 'urgent');
  }

  flush(): void {
    this.cloud.flush();
  }

  syncSave(timeoutMs: number): Promise<boolean> {
    return this.player ? this.cloud.whenSynced(timeoutMs) : Promise.resolve(false);
  }

  loadRunSnapshot(): unknown {
    return readJson(this.storage, RUN_STORAGE_KEY);
  }

  saveRunSnapshot(snapshot: RunSnapshot | null): void {
    if (snapshot) writeJson(this.storage, RUN_STORAGE_KEY, snapshot);
    else removeItem(this.storage, RUN_STORAGE_KEY);
  }

  // ── Реклама (docs/yandex/sdk/sdk-adv.md) ────────────────────────────────────────────────

  showInterstitial(): Promise<boolean> {
    const sdk = this.sdk;
    if (!sdk) return Promise.resolve(false);
    return new Promise((resolve) => {
      const ad = this.adGuard<boolean>(resolve, false);
      try {
        sdk.adv.showFullscreenAdv({
          callbacks: {
            onOpen: ad.opened,
            // onClose приходит и после ошибки, и когда платформа не показала рекламу из-за частоты.
            onClose: (wasShown) => ad.finish(wasShown === true),
            onError: () => ad.finish(false),
            onOffline: () => ad.finish(false),
          },
        });
      } catch {
        ad.finish(false);
      }
    });
  }

  showRewarded(onRewarded: () => void): Promise<RewardedResult> {
    const sdk = this.sdk;
    if (!sdk) return Promise.resolve('error');
    return new Promise((resolve) => {
      let rewarded = false;
      const ad = this.adGuard<RewardedResult>(resolve, 'error');
      try {
        sdk.adv.showRewardedVideo({
          callbacks: {
            onOpen: ad.opened,
            onRewarded: () => {
              if (ad.done || rewarded) return;
              rewarded = true;
              // Награда — только здесь, в колбэке onRewarded (CLAUDE.md, «Реклама»).
              onRewarded();
            },
            onClose: () => ad.finish(rewarded ? 'rewarded' : 'closed'),
            onError: () => ad.finish(rewarded ? 'rewarded' : 'error'),
          },
        });
      } catch {
        ad.finish('error');
      }
    });
  }

  setBannerVisible(visible: boolean): void {
    this.callSdk((sdk) => {
      const request = visible ? sdk.adv.showBannerAdv() : sdk.adv.hideBannerAdv();
      // Баннер не подключён в консоли или ошибка показа — игре это не мешает.
      void Promise.resolve(request).catch(() => undefined);
    });
  }

  // ── Покупки (docs/yandex/sdk/sdk-purchases.md) ──────────────────────────────────────────

  async getCatalog(): Promise<CatalogProduct[] | null> {
    const payments = await this.payments();
    if (!payments) return null;
    try {
      const products = await payments.getCatalog();
      return products.map((product) => ({
        id: product.id,
        priceValue: String(product.priceValue),
        currencyCode: String(product.priceCurrencyCode),
        currencyImage: currencyImage(product),
      }));
    } catch {
      return null;
    }
  }

  async getPurchases(): Promise<OwnedPurchase[] | null> {
    const payments = await this.payments();
    if (!payments) return null;
    try {
      const purchases = await payments.getPurchases();
      return purchases.map(toOwned).filter((item): item is OwnedPurchase => item !== null);
    } catch {
      return null;
    }
  }

  async purchase(productId: string): Promise<OwnedPurchase | null> {
    const payments = await this.payments();
    if (!payments) return null;
    try {
      return toOwned(await payments.purchase({ id: productId }));
    } catch {
      // Игрок закрыл окно оплаты, не хватило средств, товара нет в консоли и т. п.
      return null;
    }
  }

  async consumePurchase(token: string): Promise<boolean> {
    const payments = await this.payments();
    if (!payments) return false;
    try {
      await payments.consumePurchase(token);
      return true;
    } catch {
      return false;
    }
  }

  // ── Игрок (docs/yandex/sdk/sdk-player.md) ───────────────────────────────────────────────

  get authorized(): boolean {
    try {
      return this.player?.isAuthorized() === true;
    } catch {
      return false;
    }
  }

  get canAuthorize(): boolean {
    return this.sdk !== null && !this.authorized;
  }

  async openAuthDialog(): Promise<boolean> {
    const sdk = this.sdk;
    if (!sdk) return false;
    try {
      await sdk.auth.openAuthDialog();
      return true;
    } catch {
      // Игрок закрыл окно входа или вход не удался.
      return false;
    }
  }

  onAccountSelection(listener: (open: boolean) => void): () => void {
    this.accountListeners.add(listener);
    return () => {
      this.accountListeners.delete(listener);
    };
  }

  // ── Лидерборд (docs/yandex/sdk/sdk-leaderboard.md) ──────────────────────────────────────

  submitScore(score: number): Promise<boolean> {
    // Запросы идут по очереди: так между ними точно не меньше секунды.
    const result = this.scoreQueue.then(() => this.sendScore(score));
    this.scoreQueue = result;
    return result;
  }

  async getLeaderboard(): Promise<LeaderboardData | null> {
    const sdk = this.sdk;
    if (!sdk) return null;
    const cached = this.leaderboardCache;
    if (cached && this.clock.now() - cached.at < LEADERBOARD_CACHE_MS) return cached.data;
    try {
      const authorized = this.authorized;
      const result = await sdk.leaderboards.getEntries(LEADERBOARD.name, {
        quantityTop: LEADERBOARD.top,
        includeUser: authorized,
        ...(authorized ? { quantityAround: 1 } : {}),
      });
      const selfId = authorized ? this.uniqueId() : '';
      const rows: LeaderboardRow[] = [];
      for (const entry of result.entries) {
        const row = toRow(entry, selfId);
        if (row && !rows.some((item) => item.rank === row.rank)) rows.push(row);
      }
      rows.sort((a, b) => a.rank - b.rank);
      const data: LeaderboardData = {
        top: rows.filter((row) => row.rank <= LEADERBOARD.top),
        player: rows.find((row) => row.self) ?? null,
      };
      this.leaderboardCache = { at: this.clock.now(), data };
      return data;
    } catch {
      return null;
    }
  }

  // ── Прочее ──────────────────────────────────────────────────────────────────────────────

  async getFlags(defaults: Readonly<Record<string, string>>): Promise<Record<string, string>> {
    const result: Record<string, string> = { ...defaults };
    const sdk = this.sdk;
    if (!sdk) return result;
    try {
      const flags = await this.withTimeout(
        sdk.getFlags({ defaultFlags: { ...defaults } }),
        FLAGS_TIMEOUT_MS,
      );
      if (flags && typeof flags === 'object') {
        for (const [name, value] of Object.entries(flags)) {
          if (typeof value === 'string') result[name] = value;
        }
      }
    } catch {
      // Флаги не пришли: играем со значениями по умолчанию.
    }
    return result;
  }

  async requestReview(): Promise<ReviewResult> {
    const sdk = this.sdk;
    if (!sdk) return 'later';
    try {
      const check = await sdk.feedback.canReview();
      if (!check.value) return REVIEW_DONE_REASONS.has(String(check.reason)) ? 'done' : 'later';
      await sdk.feedback.requestReview();
      return 'shown';
    } catch {
      return 'later';
    }
  }

  async canAddShortcut(): Promise<boolean> {
    const sdk = this.sdk;
    if (!sdk) return false;
    try {
      return (await sdk.shortcut.canShowPrompt()).canShow === true;
    } catch {
      return false;
    }
  }

  async addShortcut(): Promise<boolean> {
    const sdk = this.sdk;
    if (!sdk) return false;
    try {
      return (await sdk.shortcut.showPrompt()).outcome === 'accepted';
    } catch {
      return false;
    }
  }

  // ── Внутреннее ──────────────────────────────────────────────────────────────────────────

  private writeCloud(): Promise<void> {
    const save = this.latestSave;
    if (!this.player || !save) return Promise.resolve();
    // flush: true — один вызов равен одному запросу, так планировщик точно держит лимит.
    return this.player.setData(save, true);
  }

  /**
   * Покупки инициализируются один раз (ysdk.getPayments предзагружает данные).
   * Если не получилось, в следующий раз попробуем снова.
   */
  private payments(): Promise<Payments | null> {
    const sdk = this.sdk;
    if (!sdk) return Promise.resolve(null);
    if (!this.paymentsRequest) {
      let request: Promise<Payments>;
      try {
        request = sdk.getPayments();
      } catch (error) {
        request = Promise.reject(error);
      }
      this.paymentsRequest = request.then(
        (payments) => payments,
        () => {
          this.paymentsRequest = null;
          return null;
        },
      );
    }
    return this.paymentsRequest;
  }

  private async sendScore(score: number): Promise<boolean> {
    const sdk = this.sdk;
    if (!sdk || !this.authorized) return false;
    try {
      // Документация просит проверить доступность метода перед отправкой.
      if (!(await sdk.isAvailableMethod('leaderboards.setScore'))) return false;
      const wait = this.lastScoreAt + SCORE_INTERVAL_MS - this.clock.now();
      if (wait > 0) await this.sleep(wait);
      this.lastScoreAt = this.clock.now();
      await sdk.leaderboards.setScore(LEADERBOARD.name, Math.max(0, Math.floor(score)));
      this.leaderboardCache = null;
      return true;
    } catch {
      return false;
    }
  }

  private uniqueId(): string {
    try {
      return this.player?.getUniqueID() ?? '';
    } catch {
      return '';
    }
  }

  private listenAccountSelection(sdk: SDK): void {
    // В типах @types/ysdk у on() только события паузы; события окна выбора аккаунта
    // описаны в docs/yandex/sdk/sdk-events.md.
    const on = sdk.on as unknown as (event: string, listener: () => void) => unknown;
    const events = sdk.EVENTS as Partial<Record<string, string>> | undefined;
    try {
      on.call(sdk, events?.[ACCOUNT_DIALOG_OPENED] ?? ACCOUNT_DIALOG_OPENED, () => {
        // Пока игрок выбирает прогресс, старые данные в облако не пишем.
        this.cloud.suspend();
        this.accountListeners.forEach((listener) => listener(true));
      });
      on.call(sdk, events?.[ACCOUNT_DIALOG_CLOSED] ?? ACCOUNT_DIALOG_CLOSED, () => {
        this.accountListeners.forEach((listener) => listener(false));
      });
    } catch {
      // Старый SDK без этих событий: окно выбора аккаунта игре просто не встретится.
    }
  }

  /**
   * Общая часть показа рекламы: результат отдаётся один раз; если реклама не открылась
   * за AD_OPEN_TIMEOUT_MS, игра продолжает, а поздние колбэки уже ничего не меняют.
   */
  private adGuard<T>(
    resolve: (result: T) => void,
    timeoutResult: T,
  ): { readonly done: boolean; opened: () => void; finish: (result: T) => void } {
    let done = false;
    let timer: unknown = null;
    const finish = (result: T): void => {
      if (done) return;
      done = true;
      if (timer !== null) this.clock.clearTimeout(timer);
      resolve(result);
    };
    timer = this.clock.setTimeout(() => {
      timer = null;
      finish(timeoutResult);
    }, AD_OPEN_TIMEOUT_MS);
    return {
      get done() {
        return done;
      },
      opened: () => {
        if (done || timer === null) return;
        // Реклама на экране: дальше ждём её закрытия, сколько бы она ни шла.
        this.clock.clearTimeout(timer);
        timer = null;
      },
      finish,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.clock.setTimeout(resolve, ms);
    });
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
    return new Promise((resolve, reject) => {
      const timer = this.clock.setTimeout(() => resolve(null), ms);
      promise.then(
        (value) => {
          this.clock.clearTimeout(timer);
          resolve(value);
        },
        (error: unknown) => {
          this.clock.clearTimeout(timer);
          reject(error instanceof Error ? error : new Error(String(error)));
        },
      );
    });
  }

  private callSdk(action: (sdk: SDK) => void): void {
    if (!this.sdk) return;
    try {
      action(this.sdk);
    } catch {
      // Сбой SDK не должен останавливать игру.
    }
  }
}

function toRow(entry: LeaderboardEntry, selfId: string): LeaderboardRow | null {
  const { rank, score } = entry;
  if (!Number.isSafeInteger(rank) || rank < 1) return null;
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0) return null;
  const id = typeof entry.player?.uniqueID === 'string' ? entry.player.uniqueID : '';
  return {
    rank,
    score: Math.floor(score),
    self: selfId !== '' && id === selfId,
    seed: hashString(id || `rank-${rank}`),
  };
}
