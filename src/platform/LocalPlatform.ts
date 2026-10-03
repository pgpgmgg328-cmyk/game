import type { SchedulerClock } from '../core/save/CloudWriteScheduler';
import type { RunSnapshot } from '../core/run/snapshot';
import type { SaveSources } from '../core/save/restore';
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
  OwnedPurchase,
  Platform,
  ReviewResult,
  RewardedResult,
} from './Platform';

export interface LocalPlatformOptions {
  /** Хранилище сохранений. По умолчанию — localStorage, если он доступен. */
  storage?: StorageLike | null;
  /** Язык. По умолчанию — параметр ?lang= в адресе (для проверки переводов) или язык браузера. */
  lang?: string;
  /** Тип устройства. По умолчанию — по тому, чем игрок управляет: пальцем или мышью. */
  deviceType?: DeviceType;
  /** Часы для заглушки рекламы (в тестах — управляемые). */
  clock?: SchedulerClock;
}

/** Заглушка рекламы длится секунду (CLAUDE.md, «Архитектура»). */
export const LOCAL_AD_MS = 1000;

const realClock: SchedulerClock = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
  clearTimeout: (handle) => window.clearTimeout(handle as number),
};

function detectLang(): string {
  const fromUrl = new URLSearchParams(window.location.search).get('lang');
  return fromUrl ?? window.navigator.language ?? '';
}

function detectDeviceType(): DeviceType {
  const coarse =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  return coarse ? 'mobile' : 'desktop';
}

/**
 * Площадка для локального запуска без SDK (`npm run dev`, игра одним файлом, тесты).
 * Сохранения — в localStorage. Реклама — заглушка на 1 с: награда засчитывается, чтобы можно было
 * проверить все кнопки «▶ Реклама». Покупок, входа и таблицы рекордов без Яндекса нет — игра
 * показывает, что они недоступны; проверять их — через `npm run dev:ya` или черновик в консоли.
 */
export class LocalPlatform implements Platform {
  readonly kind = 'local' as const;
  lang = '';
  deviceType: DeviceType = 'desktop';
  readonly authorized = false;
  readonly canAuthorize = false;
  private readonly options: LocalPlatformOptions;
  private readonly clock: SchedulerClock;
  private storage: StorageLike | null = null;

  constructor(options: LocalPlatformOptions = {}) {
    this.options = options;
    this.clock = options.clock ?? realClock;
  }

  async init(): Promise<void> {
    this.storage = this.options.storage !== undefined ? this.options.storage : browserStorage();
    this.lang = this.options.lang ?? detectLang();
    this.deviceType = this.options.deviceType ?? detectDeviceType();
  }

  // Локально нет площадки, которой нужно сообщать о загрузке и разметке геймплея.
  ready(): void {}

  gameplayStart(): void {}

  gameplayStop(): void {}

  // Локально площадка не ставит игру на паузу: вкладку и фокус отслеживает сама игра.
  onPause(_listener: () => void): () => void {
    return () => {};
  }

  onResume(_listener: () => void): () => void {
    return () => {};
  }

  async loadSave(): Promise<SaveSources> {
    return { cloud: null, local: readJson(this.storage, SAVE_STORAGE_KEY) };
  }

  persist(save: Save): void {
    writeJson(this.storage, SAVE_STORAGE_KEY, save);
  }

  // Локальные записи синхронные, откладывать нечего.
  flush(): void {}

  // Облака нет: ждать нечего, но и «записано в облако» сказать нельзя.
  async syncSave(_timeoutMs: number): Promise<boolean> {
    return false;
  }

  loadRunSnapshot(): unknown {
    return readJson(this.storage, RUN_STORAGE_KEY);
  }

  saveRunSnapshot(snapshot: RunSnapshot | null): void {
    if (snapshot) writeJson(this.storage, RUN_STORAGE_KEY, snapshot);
    else removeItem(this.storage, RUN_STORAGE_KEY);
  }

  async showInterstitial(): Promise<boolean> {
    await this.wait(LOCAL_AD_MS);
    return true;
  }

  async showRewarded(onRewarded: () => void): Promise<RewardedResult> {
    await this.wait(LOCAL_AD_MS);
    onRewarded();
    return 'rewarded';
  }

  // Баннера без площадки нет.
  setBannerVisible(_visible: boolean): void {}

  async getCatalog(): Promise<CatalogProduct[] | null> {
    return null;
  }

  async getPurchases(): Promise<OwnedPurchase[] | null> {
    return null;
  }

  async purchase(_productId: string): Promise<OwnedPurchase | null> {
    return null;
  }

  async consumePurchase(_token: string): Promise<boolean> {
    return false;
  }

  async openAuthDialog(): Promise<boolean> {
    return false;
  }

  onAccountSelection(_listener: (open: boolean) => void): () => void {
    return () => {};
  }

  serverTime(): number {
    return this.clock.now();
  }

  async submitScore(_score: number): Promise<boolean> {
    return false;
  }

  async getLeaderboard(): Promise<LeaderboardData | null> {
    return null;
  }

  async getFlags(defaults: Readonly<Record<string, string>>): Promise<Record<string, string>> {
    return { ...defaults };
  }

  async requestReview(): Promise<ReviewResult> {
    return 'later';
  }

  async canAddShortcut(): Promise<boolean> {
    return false;
  }

  async addShortcut(): Promise<boolean> {
    return false;
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.clock.setTimeout(resolve, ms);
    });
  }
}
