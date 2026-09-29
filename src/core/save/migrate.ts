import { SAVE_VERSION, isJsonObject, sanitizeSave, type JsonObject, type Save } from './schema';

/** Переводит данные из версии N в N + 1 и выставляет v: N + 1. */
export type Migration = (data: JsonObject) => JsonObject;

/** Миграции по версии, из которой переводим. */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  // v1 → v2 (M1): появилась статистика — рекорд и число забегов.
  1: (data) => ({ ...data, v: 2, stats: { bestScore: 0, runs: 0 } }),
  // v2 → v3 (M2): монеты, апгрейды, альбом, достижения и обучение. Кто уже доиграл забег,
  // умеет играть: обучение ему не показываем. Остальные поля заполнит sanitizeSave.
  2: (data) => {
    const stats = isJsonObject(data.stats) ? data.stats : {};
    const played = typeof stats.runs === 'number' && stats.runs > 0;
    return { ...data, v: 3, tutorial: { done: played, squish: played } };
  },
};

export type ReadResult =
  | { kind: 'ok'; save: Save }
  /** Сохранения ещё нет. */
  | { kind: 'empty' }
  /** Данные битые или их нельзя перевести в текущую версию. */
  | { kind: 'invalid' }
  /** Данные записала более новая версия игры: читать их нельзя, но и затирать тоже. */
  | { kind: 'future'; version: number };

export interface ReadOptions {
  migrations: Readonly<Record<number, Migration>>;
  version: number;
  sanitize: (data: JsonObject) => Save;
}

const DEFAULT_READ_OPTIONS: ReadOptions = {
  migrations: MIGRATIONS,
  version: SAVE_VERSION,
  sanitize: sanitizeSave,
};

/** Читает сохранение любой известной версии и приводит его к текущей. Никогда не бросает исключений. */
export function readSave(raw: unknown, options: ReadOptions = DEFAULT_READ_OPTIONS): ReadResult {
  if (raw === null || raw === undefined) return { kind: 'empty' };
  if (!isJsonObject(raw)) return { kind: 'invalid' };

  const version = raw.v;
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 0) {
    return { kind: 'invalid' };
  }
  if (version > options.version) return { kind: 'future', version };

  let data: JsonObject = raw;
  for (let from = version; from < options.version; from += 1) {
    const migration = options.migrations[from];
    if (!migration) return { kind: 'invalid' };
    try {
      data = migration(data);
    } catch {
      return { kind: 'invalid' };
    }
    if (!isJsonObject(data) || data.v !== from + 1) return { kind: 'invalid' };
  }

  try {
    return { kind: 'ok', save: options.sanitize(data) };
  } catch {
    return { kind: 'invalid' };
  }
}
