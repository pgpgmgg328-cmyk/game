import { SCORE } from '../../config/balance';

/** Касание двух клавиш одного тира за шаг физики. a и b — номера клавиш. */
export interface MergeCandidate {
  a: number;
  b: number;
  tier: number;
}

/** Что получается из двух одинаковых клавиш: форма следующего тира или мега-клац двух Пробелов. */
export type MergeResult = { kind: 'form'; tier: number } | { kind: 'mega' };

export interface PlannedMerge {
  a: number;
  b: number;
  tier: number;
  result: MergeResult;
}

export function mergeResult(tier: number, maxTier: number): MergeResult {
  return tier >= maxTier ? { kind: 'mega' } : { kind: 'form', tier: tier + 1 };
}

/**
 * Выбирает слияния из касаний за один шаг физики. Каждая клавиша сливается не больше одного
 * раза за шаг (диздок, раздел 3: защита от двойного слияния). Если клавиша касается двух
 * одинаковых соседей, сливается с тем, у кого номер меньше (он появился раньше), — так результат
 * не зависит от порядка событий физики.
 */
export function planMerges(candidates: readonly MergeCandidate[], maxTier: number): PlannedMerge[] {
  const pairs = candidates
    .filter((candidate) => candidate.a !== candidate.b)
    .map((candidate) => ({
      a: Math.min(candidate.a, candidate.b),
      b: Math.max(candidate.a, candidate.b),
      tier: candidate.tier,
    }))
    .sort((left, right) => left.a - right.a || left.b - right.b);

  const used = new Set<number>();
  const result: PlannedMerge[] = [];
  for (const pair of pairs) {
    if (used.has(pair.a) || used.has(pair.b)) continue;
    used.add(pair.a);
    used.add(pair.b);
    result.push({ ...pair, result: mergeResult(pair.tier, maxTier) });
  }
  return result;
}

/** Очки за слияние (config/balance.ts). */
export function mergeScore(result: MergeResult): number {
  return result.kind === 'mega' ? SCORE.mega : (SCORE.byTier[result.tier] ?? 0);
}
