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
import type { DeviceType, Platform } from './Platform';

export interface LocalPlatformOptions {
  /** Хранилище сохранений. По умолчанию — localStorage, если он доступен. */
  storage?: StorageLike | null;
  /** Язык. По умолчанию — параметр ?lang= в адресе (для проверки переводов) или язык браузера. */
  lang?: string;
  /** Тип устройства. По умолчанию — по тому, чем игрок управляет: пальцем или мышью. */
  deviceType?: DeviceType;
}

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
 * Площадка для локального запуска без SDK (`npm run dev`, тесты).
 * Сохранения — в localStorage, событий паузы от площадки нет, разметку геймплея отправлять некуда.
 */
export class LocalPlatform implements Platform {
  readonly kind = 'local' as const;
  lang = '';
  deviceType: DeviceType = 'desktop';
  private readonly options: LocalPlatformOptions;
  private storage: StorageLike | null = null;

  constructor(options: LocalPlatformOptions = {}) {
    this.options = options;
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

  loadRunSnapshot(): unknown {
    return readJson(this.storage, RUN_STORAGE_KEY);
  }

  saveRunSnapshot(snapshot: RunSnapshot | null): void {
    if (snapshot) writeJson(this.storage, RUN_STORAGE_KEY, snapshot);
    else removeItem(this.storage, RUN_STORAGE_KEY);
  }
}
