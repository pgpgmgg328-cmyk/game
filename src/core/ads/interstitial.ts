import { ADS } from '../../config/balance';

export interface InterstitialCheck {
  /** Куплено «Без рекламы». */
  noAds: boolean;
  /** Сколько забегов игрок уже доиграл (вместе с только что закончившимся). */
  completedRuns: number;
  /** Сейчас и время прошлого показа рекламы (полноэкранной или за награду), мс. */
  nowMs: number;
  lastAdAtMs: number | null;
  /** Флаг interstitialCooldownSec. */
  cooldownSec: number;
}

/**
 * Можно ли показать полноэкранную рекламу (диздок, раздел 8): только без покупки «Без рекламы»,
 * не после первых двух забегов нового игрока и не чаще раза в interstitialCooldownSec.
 * Где её показывать — решает экран: только по «Ещё раз» и «В меню» на экране результата.
 */
export function canShowInterstitial(check: InterstitialCheck): boolean {
  if (check.noAds) return false;
  if (check.completedRuns <= ADS.interstitialFreeRuns) return false;
  if (check.lastAdAtMs === null) return true;
  return check.nowMs - check.lastAdAtMs >= check.cooldownSec * 1000;
}
