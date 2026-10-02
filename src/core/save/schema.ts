import { UPGRADES } from '../../config/balance';

/** Текущая версия схемы. При изменении формата: увеличить версию и добавить миграцию в migrate.ts. */
export const SAVE_VERSION = 5;

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

/** Покупки (config/iap.ts). Постоянные ещё и восстанавливаются из getPurchases() при каждом запуске. */
export interface Purchases {
  /** «Без рекламы»: нет полноэкранной рекламы и стики-баннера. */
  noAds: boolean;
  /** «Набор украшений»: скины банки и фоны (M4). */
  skinsPack: boolean;
  /**
   * Токены расходуемых покупок, которые уже выданы, но ещё не консумированы. Если консумировать
   * не получилось, при следующем запуске покупка придёт снова — по токену она не выдаётся дважды.
   */
  granted: string[];
}

/** Разовые просьбы площадки (диздок, раздел 9). */
export interface Prompts {
  /** Оценку игры уже просили (или игра уже оценена): больше не спрашиваем. */
  review: boolean;
  /** Ярлык на рабочий стол уже добавлен. */
  shortcut: boolean;
}

/** Миры (диздок, раздел 5). Открыт ли мир, считает core/meta/worlds.ts. */
export interface Worlds {
  /** Мир в карусели меню: в нём начнётся забег. Пустая строка — первый мир. */
  selected: string;
  /** Миры, открытые за монеты. */
  bought: string[];
}

/** «Клавиша дня»: вырастить форму tier в мире world (диздок, раздел 6). */
export interface DailyTask {
  world: string;
  tier: number;
}

/** Ежедневное: задание, подарки и серия дней. Дни считает core/meta/daily.ts по серверному времени. */
export interface Daily {
  /** День, к которому относятся задание и подарки; -1 — ещё не было. */
  day: number;
  task: DailyTask | null;
  /** Задание этого дня выполнено (награда выдана). */
  taskDone: boolean;
  /** Бесплатный подарок этого дня получен. */
  gift: boolean;
  /** Второй подарок этого дня (за рекламу) получен. */
  adGift: boolean;
  /** Сколько дней подряд выполнено задание — по день lastDone включительно. */
  streak: number;
  /** День последнего выполненного задания; -1 — ещё не было. */
  lastDone: number;
  /** Самая длинная серия: с семи дней — банка «Радуга» и «Неделя подряд». */
  bestStreak: number;
}

/** Выбранные украшения: банка и фон (themes/decor.ts). Недоступное заменяется обычным при показе. */
export interface Decor {
  jar: string;
  background: string;
}

export interface SaveV5 {
  v: 5;
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
  purchases: Purchases;
  prompts: Prompts;
  worlds: Worlds;
  daily: Daily;
  decor: Decor;
}

/** Сохранение текущей версии. */
export type Save = SaveV5;

/** Обычная банка и фон мира: есть у всех. */
export const DEFAULT_JAR = 'glass';
export const DEFAULT_BACKGROUND = 'world';

export type JsonObject = Record<string, unknown>;

/** Только для чтения на всю глубину: так экраны читают сохранение, не меняя его в обход update. */
export type DeepReadonly<T> = { readonly [K in keyof T]: DeepReadonly<T[K]> };

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createDefaultSave(): Save {
  return {
    v: 5,
    rev: 0,
    settings: { sound: true, music: true },
    stats: { bestScore: 0, runs: 0, merges: 0, goldenMerges: 0, megas: 0 },
    coins: 0,
    upgrades: { shake: 0, remove: 0, preview: 0, squish: 0, golden: 0, jar: 0 },
    album: {},
    achievements: [],
    tutorial: { done: false, squish: false },
    purchases: { noAds: false, skinsPack: false, granted: [] },
    prompts: { review: false, shortcut: false },
    worlds: { selected: '', bought: [] },
    daily: {
      day: -1,
      task: null,
      taskDone: false,
      gift: false,
      adGift: false,
      streak: 0,
      lastDone: -1,
      bestStreak: 0,
    },
    decor: { jar: DEFAULT_JAR, background: DEFAULT_BACKGROUND },
  };
}

/** id миров и достижений: латиница, цифры, дефис и подчёркивание. */
const ID_PATTERN = /^[a-z0-9_-]{1,40}$/;
/** Токен покупки — непустая строка разумной длины без пробелов. */
const TOKEN_PATTERN = /^\S{1,200}$/;
/** Больше невыданных токенов не храним: старые — давно консумированы или не нужны. */
export const MAX_GRANTED_TOKENS = 20;
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

function sanitizeTokens(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const tokens = value.filter(
    (token): token is string => typeof token === 'string' && TOKEN_PATTERN.test(token),
  );
  return [...new Set(tokens)].slice(-MAX_GRANTED_TOKENS);
}

/** Список id без повторов; мусор отбрасывается. */
function idList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids = value.filter((id): id is string => typeof id === 'string' && ID_PATTERN.test(id));
  return [...new Set(ids)];
}

function idOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && ID_PATTERN.test(value) ? value : fallback;
}

/** Номер дня: целое от -1 (ещё не было) до разумного предела. */
const MAX_DAY = 1_000_000;

function dayOr(value: unknown): number {
  return Number.isSafeInteger(value) && (value as number) >= -1 && (value as number) <= MAX_DAY
    ? (value as number)
    : -1;
}

function sanitizeTask(value: unknown): DailyTask | null {
  if (!isJsonObject(value)) return null;
  const { world, tier } = value;
  if (typeof world !== 'string' || !ID_PATTERN.test(world)) return null;
  if (!Number.isInteger(tier) || (tier as number) < 1 || (tier as number) > MAX_TIER) return null;
  return { world, tier: tier as number };
}

function sanitizeDaily(value: unknown): Daily {
  const daily = objectOr(value);
  const lastDone = dayOr(daily.lastDone);
  const streak = lastDone === -1 ? 0 : counterOr(daily.streak, 0);
  return {
    day: dayOr(daily.day),
    task: sanitizeTask(daily.task),
    taskDone: booleanOr(daily.taskDone, false),
    gift: booleanOr(daily.gift, false),
    adGift: booleanOr(daily.adGift, false),
    streak,
    lastDone,
    bestStreak: Math.max(streak, counterOr(daily.bestStreak, 0)),
  };
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
  const purchases = objectOr(data.purchases);
  const prompts = objectOr(data.prompts);
  const worlds = objectOr(data.worlds);
  const decor = objectOr(data.decor);
  const levels = { ...defaults.upgrades };
  for (const id of UPGRADE_IDS) {
    levels[id] = Math.min(counterOr(upgrades[id], 0), UPGRADES[id].maxLevel);
  }
  return {
    v: 5,
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
    achievements: idList(data.achievements),
    tutorial: {
      done: booleanOr(tutorial.done, false),
      squish: booleanOr(tutorial.squish, false),
    },
    purchases: {
      noAds: booleanOr(purchases.noAds, false),
      skinsPack: booleanOr(purchases.skinsPack, false),
      granted: sanitizeTokens(purchases.granted),
    },
    prompts: {
      review: booleanOr(prompts.review, false),
      shortcut: booleanOr(prompts.shortcut, false),
    },
    worlds: {
      selected: idOr(worlds.selected, ''),
      bought: idList(worlds.bought),
    },
    daily: sanitizeDaily(data.daily),
    decor: {
      jar: idOr(decor.jar, DEFAULT_JAR),
      background: idOr(decor.background, DEFAULT_BACKGROUND),
    },
  };
}
