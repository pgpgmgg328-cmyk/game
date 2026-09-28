/**
 * Цепочка слияний: каждое следующее слияние быстрее окна повышает тон на полутон
 * (диздок, раздел 13). Получается «музыкальное» комбо.
 */
export class ComboCounter {
  private readonly windowMs: number;
  private readonly maxSteps: number;
  private step = 0;
  private lastAt = Number.NEGATIVE_INFINITY;

  constructor(windowMs: number, maxSteps: number) {
    this.windowMs = windowMs;
    this.maxSteps = maxSteps;
  }

  /** Отмечает слияние в момент nowMs (время забега) и возвращает шаг комбо: 0, 1, 2… */
  hit(nowMs: number): number {
    this.step = nowMs - this.lastAt < this.windowMs ? Math.min(this.maxSteps, this.step + 1) : 0;
    this.lastAt = nowMs;
    return this.step;
  }

  reset(): void {
    this.step = 0;
    this.lastAt = Number.NEGATIVE_INFINITY;
  }
}

/** Во сколько раз поднять частоту, чтобы тон вырос на steps полутонов. */
export function semitoneRatio(steps: number): number {
  return 2 ** (steps / 12);
}
