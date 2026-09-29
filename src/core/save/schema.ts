import { UPGRADES } from '../../config/balance';

/** Текущая версия схемы. При изменении формата: увеличить версию и добавить миграцию в migrate.ts. */
export const SAVE_VERSION = 3;

export interface Settings {
  sound: boolean;
  music: boolean;
}

/** Статистика игрока за всё время. */
export interface Stats {
  /** Лучший счёт за забег. */
  bestScore: number;
  /** Сколько забегов закончилось переполнением банки. */
  runs: number;
  /** Слияний всего. */
  merges: number;
  /** Слияний с золотой клавишей. */
  goldenMerges: number;
  /** Мега-клацев (два Пробела). */
  megas: number;
}

/** Апгрейды «+1» (диздок, раздел 6). */
export type UpgradeId = 'shake' | 'remove' | 'preview' | 'squish' | 'golden' | 'jar';
export const UPGRADE_IDS: readonly UpgradeId[] = [
  'shake',
  'remove',
  'preview',
  'squish',
  'golden',
  'jar',
];

/** Открытые формы одного мира: номера тиров по возрастанию. */
export interface WorldAlbum {
  forms: number[];
  golden: number[];
}

export interface Tutorial {
  /** Первое слияние по подсказке сделано — рука больше не показывается. */
  done: boolean;
  /** Игрок уже тапал по клавише — подсказка про сквиш больше не нужна. */
  squish: boolean;
}

export interface SaveV3 {
  v: 3;
  /** Счётчик изменений. Из облака и локального кэша берём сохранение с большим rev. */
  rev: number;
  settings: Settings;
  stats: Stats;
  /** Монеты «клацы». */
  coins: number;
  /** Уровни апгрейдов. */
  upgrades: Record<UpgradeId, number>;
  /** Альбом по мирам: id мира → открытые формы. */
  album: Record<string, WorldAlbum>;
  /** Полученные достижения. */
  achievements: string[];
  tutorial: Tutorial;
}

/** Сохранение текущей версии. */
export type Save = SaveV3;

export type JsonObject = Record<string, unknown>;

/** Только для чтения на всю глубину: так экраны читают сохранение, не меняя его в обход update. */
export type DeepReadonly<T> = { readonly [K in keyof T]: DeepReadonly<T[K]> };

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createDefaultSave(): Save {
  return {
    v: 3,
    rev: 0,
    settings: { sound: true, music: true },
    stats: { bestScore: 0, runs: 0, merges: 0, goldenMerges: 0, megas: 0 },
    coins: 0,
    upgrades: { shake: 0, remove: 0, preview: 0, squish: 0, golden: 0, jar: 0 },
    album: {},
    achievements: [],
    tutorial: { done: false, squish: false },
  };
}

/** id миров и достижений: латиница, цифры, дефис и подчёркивание. */
const ID_PATTERN = /^[a-z0-9_-]{1,40}$/;
/** Больше тиров в мире не бывает даже в будущих мирах. */
const MAX_TIER = 30;

function isCounter(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function counterOr(value: unknown, fallback: number): number {
  return isCounter(value) ? value : fallback;
}

function objectOr(value: unknown): JsonObject {
  return isJsonObject(value) ? value : {};
}

/** Номера тиров: целые 1…30, без повторов, по возрастанию. Мусор отбрасывается. */
function tierList(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const tiers = value.filter(
    (tier): tier is number => Number.isInteger(tier) && tier >= 1 && tier <= MAX_TIER,
  );
  return [...new Set(tiers)].sort((a, b) => a - b);
}

function sanitizeAlbum(value: unknown): Record<string, WorldAlbum> {
  const album: Record<string, WorldAlbum> = {};
  for (const [world, entry] of Object.entries(objectOr(value))) {
    if (!ID_PATTERN.test(world) || !isJsonObject(entry)) continue;
    album[world] = { forms: tierList(entry.forms), golden: tierList(entry.golden) };
  }
  return album;
}

function sanitizeAchievements(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids = value.filter((id): id is string => typeof id === 'string' && ID_PATTERN.test(id));
  return [...new Set(ids)];
}

/**
 * Приводит данные текущей версии к корректному виду: каждое битое поле заменяется
 * значением по умолчанию, остальной прогресс остаётся.
 */
export function sanitizeSave(data: JsonObject): Save {
  const defaults = createDefaultSave();
  const settings = objectOr(data.settings);
  const stats = objectOr(data.stats);
  const upgrades = objectOr(data.upgrades);
  const tutorial = objectOr(data.tutorial);
  const levels = { ...defaults.upgrades };
  for (const id of UPGRADE_IDS) {
    levels[id] = Math.min(counterOr(upgrades[id], 0), UPGRADES[id].maxLevel);
  }
  return {
    v: 3,
    rev: counterOr(data.rev, defaults.rev),
    settings: {
      sound: booleanOr(settings.sound, defaults.settings.sound),
      music: booleanOr(settings.music, defaults.settings.music),
    },
    stats: {
      bestScore: counterOr(stats.bestScore, 0),
      runs: counterOr(stats.runs, 0),
      merges: counterOr(stats.merges, 0),
      goldenMerges: counterOr(stats.goldenMerges, 0),
      megas: counterOr(stats.megas, 0),
    },
    coins: counterOr(data.coins, 0),
    upgrades: levels,
    album: sanitizeAlbum(data.album),
    achievements: sanitizeAchievements(data.achievements),
    tutorial: {
      done: booleanOr(tutorial.done, false),
      squish: booleanOr(tutorial.squish, false),
    },
  };
}
