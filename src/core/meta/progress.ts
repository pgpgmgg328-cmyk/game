import type { Save } from '../save/schema';
import { endOfRunCoins } from './coins';

/** Итог забега для сохранения. */
export interface RunOutcomeInput {
  score: number;
  /** Банка переполнилась (забег доигран). Брошенный забег даёт рекорд, но не бонус и не счётчик. */
  completed: boolean;
  merges: number;
  goldenMerges: number;
  megas: number;
  /** Монеты за слияния этого забега. */
  coins: number;
}

export interface RunOutcome {
  newRecord: boolean;
  /** Сколько монет начислено всего: за слияния и бонус за конец забега. */
  coins: number;
  /** Бонус за конец забега (очки / 100). */
  bonus: number;
}

/** Записывает итог забега в сохранение (изменяет черновик). */
export function applyRunOutcome(draft: Save, input: RunOutcomeInput): RunOutcome {
  const newRecord = input.score > draft.stats.bestScore;
  const bonus = input.completed ? endOfRunCoins(input.score) : 0;
  draft.stats.bestScore = Math.max(draft.stats.bestScore, input.score);
  draft.stats.runs += input.completed ? 1 : 0;
  draft.stats.merges += input.merges;
  draft.stats.goldenMerges += input.goldenMerges;
  draft.stats.megas += input.megas;
  draft.coins += input.coins + bonus;
  return { newRecord, coins: input.coins + bonus, bonus };
}
