import { COINS } from '../../config/balance';
import type { MergeResult } from '../run/merge';

/**
 * Монеты за слияние (диздок, раздел 6): номер получившегося тира, за мега-клац — фиксированная
 * сумма. Если в слиянии участвовала золотая клавиша — ×3.
 */
export function mergeCoins(result: MergeResult, golden: boolean): number {
  const base = result.kind === 'mega' ? COINS.mega : result.tier;
  return golden ? base * COINS.goldenMultiplier : base;
}

/** Монеты за конец забега: очки / 100 с округлением вниз. */
export function endOfRunCoins(score: number): number {
  return Math.max(0, Math.floor(score / COINS.scorePerCoin));
}
