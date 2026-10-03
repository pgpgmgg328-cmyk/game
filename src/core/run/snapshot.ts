import { isJsonObject } from '../save/schema';
import type { QueueItem } from './spawn';

/**
 * Версия формата снимка. Старые тоже читаются: в v2 ещё не было бонусов за рекламу,
 * в v3 — особых клавиш миров и пробного забега.
 */
export const RUN_SNAPSHOT_VERSION = 4;

/** «Карамелька» в банке: ещё не прилипала или держится за стенку (диздок, раздел 5). */
export type CaramelState = 'fresh' | 'stuck';

/** Клавиша в банке: тир, золотая ли, положение, поворот и скорости. */
export interface KeySnapshot {
  tier: number;
  golden: boolean;
  x: number;
  y: number;
  angle: number;
  vx: number;
  vy: number;
  spin: number;
  /** «Карамелька»: нет — обычная клавиша (или карамель уже отлипла). */
  caramel?: CaramelState;
  /** Сколько ещё держаться за стенку, мс (у прилипшей). */
  stuckMs?: number;
}

/** «Метеорчик» в полёте. */
export interface MeteorSnapshot {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** Что апгрейды дали этому забегу: после перезагрузки забег продолжится с теми же условиями. */
export interface SnapshotModifiers {
  jarWidth: number;
  preview: number;
  squishPower: number;
  goldenChance: number;
}

/** Бонусы забега за рекламу: каждый — не больше раза за забег (диздок, раздел 8). */
export interface AdBonuses {
  /** «Второй шанс» уже был. */
  revive: boolean;
  /** «+1 Встряска» за рекламу уже была. */
  shake: boolean;
  /** «+1 Удаление» за рекламу уже было. */
  remove: boolean;
}

export const NO_AD_BONUSES: Readonly<AdBonuses> = { revive: false, shake: false, remove: false };

/**
 * Снимок текущего забега (CLAUDE.md, «Сохранения»): позиции, тиры, счёт, seed.
 * Сохраняется при паузе, скрытии вкладки и каждые 5 с; после перезагрузки игра предлагает
 * «Продолжить забег?».
 */
export interface RunSnapshot {
  v: typeof RUN_SNAPSHOT_VERSION;
  /** Мир забега (id из themes/). */
  world: string;
  seed: number;
  /** Состояние генератора случайных чисел: очередь клавиш продолжится как была. */
  rng: number;
  score: number;
  /** Время активной игры без пауз. */
  elapsedMs: number;
  drops: number;
  merges: number;
  goldenMerges: number;
  megas: number;
  /** Монеты, заработанные в этом забеге. */
  coins: number;
  /** Самая большая форма, собранная в этом забеге. */
  bestTier: number;
  /** Клавиша над банкой. */
  current: QueueItem;
  /** Следующие клавиши (превью). */
  upcoming: QueueItem[];
  /** Прицел: x висящей клавиши. */
  aimX: number;
  modifiers: SnapshotModifiers;
  /** Оставшиеся заряды «Встряски» и «Удаления». */
  shakes: number;
  removes: number;
  /** Какие бонусы за рекламу уже взяты: после перезагрузки их не дадут второй раз. */
  adBonuses: AdBonuses;
  keys: KeySnapshot[];
  /** Когда в очередь встанет следующий «Метеорчик» (время игры, мс). */
  meteorAt: number;
  meteor: MeteorSnapshot | null;
  /** Пробный забег в закрытом мире за рекламу (диздок, раздел 5). */
  trial: boolean;
}

export interface SnapshotLimits {
  maxTier: number;
  maxKeys: number;
}

const MAX_COORDINATE = 100_000;
const MAX_SPEED = 1_000;

function isCounter(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isUint32(value: unknown): value is number {
  return isCounter(value) && value <= 0xffffffff;
}

function isWithin(value: unknown, limit: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit;
}

function isTier(value: unknown, maxTier: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= maxTier;
}

function optionalFlag(value: unknown): boolean | null {
  if (value === undefined) return false;
  return typeof value === 'boolean' ? value : null;
}

function readItem(raw: unknown, maxTier: number): QueueItem | null {
  if (!isJsonObject(raw) || !isTier(raw.tier, maxTier) || typeof raw.golden !== 'boolean') {
    return null;
  }
  const caramel = optionalFlag(raw.caramel);
  const meteor = optionalFlag(raw.meteor);
  if (caramel === null || meteor === null) return null;
  const item: QueueItem = { tier: raw.tier, golden: raw.golden };
  if (caramel) item.caramel = true;
  if (meteor) item.meteor = true;
  return item;
}

/** Не дольше этого «Карамелька» не держится за стенку даже в будущих мирах. */
const MAX_STUCK_MS = 60_000;

function readKey(raw: unknown, maxTier: number): KeySnapshot | null {
  if (!isJsonObject(raw) || !isTier(raw.tier, maxTier) || typeof raw.golden !== 'boolean') {
    return null;
  }
  const { x, y, angle, vx, vy, spin, caramel, stuckMs } = raw;
  if (!isWithin(x, MAX_COORDINATE) || !isWithin(y, MAX_COORDINATE)) return null;
  if (!isWithin(angle, MAX_COORDINATE)) return null;
  if (!isWithin(vx, MAX_SPEED) || !isWithin(vy, MAX_SPEED) || !isWithin(spin, MAX_SPEED)) {
    return null;
  }
  const key: KeySnapshot = { tier: raw.tier, golden: raw.golden, x, y, angle, vx, vy, spin };
  if (caramel === undefined) return key;
  if (caramel === 'fresh') return { ...key, caramel };
  if (caramel !== 'stuck' || !isWithin(stuckMs, MAX_STUCK_MS) || stuckMs < 0) return null;
  return { ...key, caramel, stuckMs };
}

function readMeteor(raw: unknown): MeteorSnapshot | null | undefined {
  if (raw === undefined || raw === null) return null;
  if (!isJsonObject(raw)) return undefined;
  const { x, y, vx, vy } = raw;
  if (!isWithin(x, MAX_COORDINATE) || !isWithin(y, MAX_COORDINATE)) return undefined;
  if (!isWithin(vx, MAX_SPEED) || !isWithin(vy, MAX_SPEED)) return undefined;
  return { x, y, vx, vy };
}

/** Бонусы за рекламу; в снимке v2 их ещё не было — значит, не брались. */
function readAdBonuses(raw: unknown): AdBonuses | null {
  if (raw === undefined) return { ...NO_AD_BONUSES };
  if (!isJsonObject(raw)) return null;
  const { revive, shake, remove } = raw;
  if (typeof revive !== 'boolean' || typeof shake !== 'boolean' || typeof remove !== 'boolean') {
    return null;
  }
  return { revive, shake, remove };
}

function readModifiers(raw: unknown): SnapshotModifiers | null {
  if (!isJsonObject(raw)) return null;
  const { jarWidth, preview, squishPower, goldenChance } = raw;
  if (!isWithin(jarWidth, 2000) || jarWidth < 100) return null;
  if (!isCounter(preview) || preview < 1 || preview > 4) return null;
  if (!isWithin(squishPower, 10) || squishPower <= 0) return null;
  if (!isWithin(goldenChance, 1) || goldenChance < 0) return null;
  return { jarWidth, preview, squishPower, goldenChance };
}

/**
 * Проверяет снимок из хранилища. Битый, чужой версии или подозрительный снимок даёт null:
 * тогда игра просто не предлагает продолжить забег и не падает.
 */
export function readRunSnapshot(raw: unknown, limits: SnapshotLimits): RunSnapshot | null {
  if (!isJsonObject(raw) || ![2, 3, RUN_SNAPSHOT_VERSION].includes(raw.v as number)) return null;
  const { world, seed, rng, score, elapsedMs, drops, merges, goldenMerges, megas, coins } = raw;
  if (typeof world !== 'string' || world === '') return null;
  if (!isUint32(seed) || !isUint32(rng)) return null;
  const counters = [score, elapsedMs, drops, merges, goldenMerges, megas, coins, raw.shakes];
  if (!counters.every(isCounter) || !isCounter(raw.removes)) return null;
  if (!isTier(raw.bestTier, limits.maxTier)) return null;
  const current = readItem(raw.current, limits.maxTier);
  if (!current) return null;
  if (!Array.isArray(raw.upcoming) || raw.upcoming.length > 8) return null;
  const upcoming: QueueItem[] = [];
  for (const item of raw.upcoming as unknown[]) {
    const read = readItem(item, limits.maxTier);
    if (!read) return null;
    upcoming.push(read);
  }
  if (!isWithin(raw.aimX, MAX_COORDINATE)) return null;
  const modifiers = readModifiers(raw.modifiers);
  if (!modifiers) return null;
  const adBonuses = readAdBonuses(raw.v === 2 ? undefined : raw.adBonuses);
  if (!adBonuses) return null;
  if (!Array.isArray(raw.keys) || raw.keys.length > limits.maxKeys) return null;

  const keys: KeySnapshot[] = [];
  for (const item of raw.keys as unknown[]) {
    const key = readKey(item, limits.maxTier);
    if (!key) return null;
    keys.push(key);
  }
  // До v4 особых клавиш и пробных забегов не было.
  const meteorAt = raw.meteorAt === undefined ? 0 : raw.meteorAt;
  if (!isCounter(meteorAt)) return null;
  const meteor = readMeteor(raw.meteor);
  if (meteor === undefined) return null;
  const trial = optionalFlag(raw.trial);
  if (trial === null) return null;
  return {
    v: RUN_SNAPSHOT_VERSION,
    world,
    seed: seed as number,
    rng: rng as number,
    score: score as number,
    elapsedMs: elapsedMs as number,
    drops: drops as number,
    merges: merges as number,
    goldenMerges: goldenMerges as number,
    megas: megas as number,
    coins: coins as number,
    bestTier: raw.bestTier as number,
    current,
    upcoming,
    aimX: raw.aimX as number,
    modifiers,
    shakes: raw.shakes as number,
    removes: raw.removes as number,
    adBonuses,
    keys,
    meteorAt,
    meteor,
    trial,
  };
}

/**
 * Снимок, который стоит предложить продолжить: целый, из известного мира, с тирами этого мира
 * и хотя бы одним сбросом. maxTierOf возвращает число форм мира или null, если мира нет.
 */
export function offerableSnapshot(
  raw: unknown,
  maxTierOf: (world: string) => number | null,
  maxKeys: number,
): RunSnapshot | null {
  if (!isJsonObject(raw) || typeof raw.world !== 'string') return null;
  const maxTier = maxTierOf(raw.world);
  if (maxTier === null) return null;
  const snapshot = readRunSnapshot(raw, { maxTier, maxKeys });
  return snapshot && snapshot.drops > 0 ? snapshot : null;
}
