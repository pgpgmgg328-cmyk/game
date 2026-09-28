import type { Stats } from '../save/schema';

export interface RunOutcome {
  stats: Stats;
  /** Счёт выше прежнего рекорда. */
  newRecord: boolean;
}

/**
 * Учитывает счёт забега в статистике. completed — банка переполнилась (забег доигран);
 * счёт брошенного забега тоже может стать рекордом, но забегом он не считается.
 */
export function applyRunResult(stats: Stats, score: number, completed: boolean): RunOutcome {
  const newRecord = score > stats.bestScore;
  return {
    stats: {
      bestScore: Math.max(stats.bestScore, score),
      runs: stats.runs + (completed ? 1 : 0),
    },
    newRecord,
  };
}
