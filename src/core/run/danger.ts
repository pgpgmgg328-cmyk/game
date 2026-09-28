/** Осевшая клавиша и то, выше ли она линии опасности. */
export interface DangerSample {
  id: number;
  above: boolean;
}

export interface DangerState {
  /** Хотя бы одна осевшая клавиша выше линии: линия мигает. */
  warning: boolean;
  /** Какая-то клавиша пробыла выше линии дольше порога: забег окончен. */
  overflow: boolean;
  /** Сколько времени выше линии самая «долгая» клавиша, мс. */
  longestMs: number;
}

/**
 * Правило линии опасности (диздок, раздел 3): если любая осевшая клавиша находится выше линии
 * дольше порога (2 с), забег заканчивается. Время считается для каждой клавиши отдельно
 * и сбрасывается, как только она опустится ниже линии.
 */
export class DangerTracker {
  private readonly overflowMs: number;
  private timers = new Map<number, number>();

  constructor(overflowMs: number) {
    this.overflowMs = overflowMs;
  }

  /** Вызывается каждый шаг физики со всеми осевшими клавишами. */
  update(samples: Iterable<DangerSample>, dtMs: number): DangerState {
    const next = new Map<number, number>();
    let longestMs = 0;
    for (const sample of samples) {
      if (!sample.above) continue;
      const time = (this.timers.get(sample.id) ?? 0) + dtMs;
      next.set(sample.id, time);
      longestMs = Math.max(longestMs, time);
    }
    // Клавиши, которых больше нет (слились) или которые опустились, забываются.
    this.timers = next;
    return { warning: next.size > 0, overflow: longestMs >= this.overflowMs, longestMs };
  }

  reset(): void {
    this.timers.clear();
  }
}
