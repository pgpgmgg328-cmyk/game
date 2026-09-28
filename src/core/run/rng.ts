/**
 * Генератор случайных чисел с seed (алгоритм mulberry32). Всё его состояние — одно 32-битное
 * число, поэтому забег легко сохранить в снимок и продолжить с того же места.
 */
export class Rng {
  private value: number;

  constructor(state: number) {
    this.value = state >>> 0;
  }

  /** Текущее состояние: передать в конструктор, чтобы продолжить ту же последовательность. */
  get state(): number {
    return this.value;
  }

  /** Число от 0 (включительно) до 1 (не включительно). */
  next(): number {
    this.value = (this.value + 0x6d2b79f5) >>> 0;
    let t = this.value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Целое число от min до max включительно. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Число от min до max. */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
}

/** Случайный seed для нового забега. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 4294967296) >>> 0;
}
