/** Текущая версия схемы. При изменении формата: увеличить версию и добавить миграцию в migrate.ts. */
export const SAVE_VERSION = 2;

export interface Settings {
  sound: boolean;
  music: boolean;
}

/** Статистика игрока. */
export interface Stats {
  /** Лучший счёт за забег. */
  bestScore: number;
  /** Сколько забегов закончилось переполнением банки. */
  runs: number;
}

export interface SaveV2 {
  v: 2;
  /** Счётчик изменений. Из облака и локального кэша берём сохранение с большим rev. */
  rev: number;
  settings: Settings;
  stats: Stats;
}

/** Сохранение текущей версии. */
export type Save = SaveV2;

export type JsonObject = Record<string, unknown>;

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createDefaultSave(): Save {
  return {
    v: 2,
    rev: 0,
    settings: { sound: true, music: true },
    stats: { bestScore: 0, runs: 0 },
  };
}

function isCounter(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function counterOr(value: unknown, fallback: number): number {
  return isCounter(value) ? value : fallback;
}

/**
 * Приводит данные текущей версии к корректному виду: каждое битое поле заменяется
 * значением по умолчанию, остальной прогресс остаётся.
 */
export function sanitizeSave(data: JsonObject): Save {
  const defaults = createDefaultSave();
  const settings = isJsonObject(data.settings) ? data.settings : {};
  const stats = isJsonObject(data.stats) ? data.stats : {};
  return {
    v: 2,
    rev: counterOr(data.rev, defaults.rev),
    settings: {
      sound: booleanOr(settings.sound, defaults.settings.sound),
      music: booleanOr(settings.music, defaults.settings.music),
    },
    stats: {
      bestScore: counterOr(stats.bestScore, defaults.stats.bestScore),
      runs: counterOr(stats.runs, defaults.stats.runs),
    },
  };
}
