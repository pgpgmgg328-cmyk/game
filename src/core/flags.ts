import { FLAG_DEFAULTS } from '../config/balance';

/**
 * Флаги remote config (диздок, раздел 11): ими можно подкрутить баланс без новой сборки.
 * Значения по умолчанию — в config/balance.ts.
 */
export interface GameFlags {
  /** Базовый шанс золотой клавиши (апгрейд «+1% золотых» прибавляется сверху). */
  goldenChance: number;
  /** Не чаще одной полноэкранной рекламы за столько секунд. */
  interstitialCooldownSec: number;
  /** Веса тиров 1–5 в начале забега. */
  spawnWeights: number[];
  /** Предлагать ли «Второй шанс» за рекламу при переполнении банки. */
  secondChanceEnabled: boolean;
  /** Подарок дня в монетах (второй подарок, за рекламу, — такой же). */
  dailyRewardCoins: number;
}

/** Границы разумного: значение вне них считаем ошибкой в консоли и берём значение по умолчанию. */
const LIMITS = {
  goldenChance: { min: 0, max: 0.5 },
  interstitialCooldownSec: { min: 0, max: 3600 },
  spawnWeight: { max: 1000 },
  dailyRewardCoins: { min: 0, max: 10_000 },
} as const;

const TRUE_WORDS = new Set(['true', '1', 'yes', 'on']);
const FALSE_WORDS = new Set(['false', '0', 'no', 'off']);

export function defaultFlags(): GameFlags {
  return {
    goldenChance: FLAG_DEFAULTS.goldenChance,
    interstitialCooldownSec: FLAG_DEFAULTS.interstitialCooldownSec,
    spawnWeights: [...FLAG_DEFAULTS.spawnWeights],
    secondChanceEnabled: FLAG_DEFAULTS.secondChanceEnabled,
    dailyRewardCoins: FLAG_DEFAULTS.dailyRewardCoins,
  };
}

/** Значения по умолчанию строками — так их ждёт ysdk.getFlags({ defaultFlags }). */
export function defaultFlagStrings(): Record<string, string> {
  const flags = defaultFlags();
  return {
    goldenChance: String(flags.goldenChance),
    interstitialCooldownSec: String(flags.interstitialCooldownSec),
    spawnWeights: flags.spawnWeights.join(','),
    secondChanceEnabled: String(flags.secondChanceEnabled),
    dailyRewardCoins: String(flags.dailyRewardCoins),
  };
}

function parseNumber(raw: string | undefined, min: number, max: number): number | null {
  if (raw === undefined) return null;
  const text = raw.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) && value >= min && value <= max ? value : null;
}

/** Веса пяти тиров: «30,28,22,14,6» или «[30, 28, 22, 14, 6]». Хотя бы один вес больше нуля. */
function parseWeights(raw: string | undefined, count: number): number[] | null {
  if (raw === undefined) return null;
  const text = raw.trim().replace(/^\[/, '').replace(/\]$/, '');
  const parts = text.split(/[,;\s]+/).filter((part) => part !== '');
  if (parts.length !== count) return null;
  const weights: number[] = [];
  for (const part of parts) {
    if (!/^\d+(\.\d+)?$/.test(part)) return null;
    const value = Number(part);
    if (!Number.isFinite(value) || value > LIMITS.spawnWeight.max) return null;
    weights.push(value);
  }
  return weights.some((weight) => weight > 0) ? weights : null;
}

function parseBoolean(raw: string | undefined): boolean | null {
  if (raw === undefined) return null;
  const word = raw.trim().toLowerCase();
  if (TRUE_WORDS.has(word)) return true;
  if (FALSE_WORDS.has(word)) return false;
  return null;
}

/**
 * Разбирает флаги из SDK (там все значения — строки). Каждый битый или отсутствующий флаг
 * заменяется значением по умолчанию, остальные остаются.
 */
export function parseFlags(raw: Readonly<Record<string, string>>): GameFlags {
  const defaults = defaultFlags();
  const { goldenChance, interstitialCooldownSec, dailyRewardCoins } = LIMITS;
  const cooldown = parseNumber(
    raw.interstitialCooldownSec,
    interstitialCooldownSec.min,
    interstitialCooldownSec.max,
  );
  const gift = parseNumber(raw.dailyRewardCoins, dailyRewardCoins.min, dailyRewardCoins.max);
  return {
    goldenChance:
      parseNumber(raw.goldenChance, goldenChance.min, goldenChance.max) ?? defaults.goldenChance,
    interstitialCooldownSec: cooldown === null ? defaults.interstitialCooldownSec : cooldown,
    spawnWeights:
      parseWeights(raw.spawnWeights, defaults.spawnWeights.length) ?? defaults.spawnWeights,
    secondChanceEnabled: parseBoolean(raw.secondChanceEnabled) ?? defaults.secondChanceEnabled,
    // Монеты — целые: «150.7» округляется вниз.
    dailyRewardCoins: gift === null ? defaults.dailyRewardCoins : Math.floor(gift),
  };
}
