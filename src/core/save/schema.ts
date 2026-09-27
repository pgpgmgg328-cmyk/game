/** Текущая версия схемы. При изменении формата: увеличить версию и добавить миграцию в migrate.ts. */
export const SAVE_VERSION = 1;

export interface Settings {
  sound: boolean;
  music: boolean;
}

export interface SaveV1 {
  v: 1;
  /** Счётчик изменений. Из облака и локального кэша берём сохранение с большим rev. */
  rev: number;
  settings: Settings;
}

/** Сохранение текущей версии. */
export type Save = SaveV1;

export type JsonObject = Record<string, unknown>;

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createDefaultSave(): Save {
  return { v: 1, rev: 0, settings: { sound: true, music: true } };
}

function isCounter(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Приводит данные версии 1 к корректному виду: каждое битое поле заменяется значением по умолчанию. */
export function sanitizeV1(data: JsonObject): Save {
  const defaults = createDefaultSave();
  const settings = isJsonObject(data.settings) ? data.settings : {};
  return {
    v: 1,
    rev: isCounter(data.rev) ? data.rev : defaults.rev,
    settings: {
      sound: booleanOr(settings.sound, defaults.settings.sound),
      music: booleanOr(settings.music, defaults.settings.music),
    },
  };
}
