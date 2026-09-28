import type { Player, SDK } from 'ysdk';
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
import type { DeviceType, Platform } from './Platform';

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

/**
 * Единственное место, где вызывается SDK Яндекс Игр (docs/yandex/sdk/).
 * Ошибки SDK не ломают игру: без SDK она работает на локальном кэше.
 */
export class YandexPlatform implements Platform {
  readonly kind = 'yandex' as const;
  lang = '';
  deviceType: DeviceType = 'desktop';

  private readonly options: YandexPlatformOptions;
  private readonly cloud: CloudWriteScheduler;
  private readonly pauseListeners = new Set<() => void>();
  private readonly resumeListeners = new Set<() => void>();
  private sdk: SDK | null = null;
  private player: Player | null = null;
  private storage: StorageLike | null = null;
  private latestSave: Save | null = null;
  private readyCalled = false;

  constructor(options: YandexPlatformOptions) {
    this.options = options;
    this.cloud = new CloudWriteScheduler(
      () => this.writeCloud(),
      options.clock ?? realClock,
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

  async loadSave(): Promise<SaveSources> {
    const local = readJson(this.storage, SAVE_STORAGE_KEY);
    let cloud: unknown = null;
    if (this.sdk) {
      try {
        // Лимит getPlayer — 20 запросов за 5 минут, поэтому объект игрока запрашиваем один раз.
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

  loadRunSnapshot(): unknown {
    return readJson(this.storage, RUN_STORAGE_KEY);
  }

  saveRunSnapshot(snapshot: RunSnapshot | null): void {
    if (snapshot) writeJson(this.storage, RUN_STORAGE_KEY, snapshot);
    else removeItem(this.storage, RUN_STORAGE_KEY);
  }

  private writeCloud(): Promise<void> {
    const save = this.latestSave;
    if (!this.player || !save) return Promise.resolve();
    // flush: true — один вызов равен одному запросу, так планировщик точно держит лимит.
    return this.player.setData(save, true);
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
