import { isJsonObject } from '../save/schema';

/** Версия формата снимка. При изменении формата старые снимки просто не предлагаются. */
export const RUN_SNAPSHOT_VERSION = 1;

/** Клавиша в банке: тир, положение, поворот и скорости. */
export interface KeySnapshot {
  tier: number;
  x: number;
  y: number;
  angle: number;
  vx: number;
  vy: number;
  spin: number;
}

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
  /** Самая большая форма, собранная в этом забеге. */
  bestTier: number;
  /** Клавиша над банкой. */
  current: number;
  /** Следующие клавиши (превью). */
  upcoming: number[];
  /** Прицел: x висящей клавиши. */
  aimX: number;
  keys: KeySnapshot[];
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

function readKey(raw: unknown, maxTier: number): KeySnapshot | null {
  if (!isJsonObject(raw)) return null;
  const { tier, x, y, angle, vx, vy, spin } = raw;
  if (!isTier(tier, maxTier)) return null;
  if (!isWithin(x, MAX_COORDINATE) || !isWithin(y, MAX_COORDINATE)) return null;
  if (!isWithin(angle, MAX_COORDINATE)) return null;
  if (!isWithin(vx, MAX_SPEED) || !isWithin(vy, MAX_SPEED) || !isWithin(spin, MAX_SPEED)) {
    return null;
  }
  return { tier, x, y, angle, vx, vy, spin };
}

/**
 * Проверяет снимок из хранилища. Битый, чужой версии или подозрительный снимок даёт null:
 * тогда игра просто не предлагает продолжить забег и не падает.
 */
export function readRunSnapshot(raw: unknown, limits: SnapshotLimits): RunSnapshot | null {
  if (!isJsonObject(raw) || raw.v !== RUN_SNAPSHOT_VERSION) return null;
  const { world, seed, rng, score, elapsedMs, drops, merges, bestTier, current, upcoming, aimX } =
    raw;
  if (typeof world !== 'string' || world === '') return null;
  if (!isUint32(seed) || !isUint32(rng)) return null;
  if (!isCounter(score) || !isCounter(elapsedMs) || !isCounter(drops) || !isCounter(merges)) {
    return null;
  }
  if (!isTier(bestTier, limits.maxTier) || !isTier(current, limits.maxTier)) return null;
  if (!Array.isArray(upcoming) || upcoming.length > 8) return null;
  if (!upcoming.every((tier) => isTier(tier, limits.maxTier))) return null;
  if (!isWithin(aimX, MAX_COORDINATE)) return null;
  if (!Array.isArray(raw.keys) || raw.keys.length > limits.maxKeys) return null;

  const keys: KeySnapshot[] = [];
  for (const item of raw.keys as unknown[]) {
    const key = readKey(item, limits.maxTier);
    if (!key) return null;
    keys.push(key);
  }
  return {
    v: RUN_SNAPSHOT_VERSION,
    world,
    seed,
    rng,
    score,
    elapsedMs,
    drops,
    merges,
    bestTier,
    current,
    upcoming: upcoming as number[],
    aimX,
    keys,
  };
}
