import type { SchedulerClock } from '../src/core/save/CloudWriteScheduler';

/** Управляемые часы: таймеры срабатывают только при advance(). */
export class FakeClock implements SchedulerClock {
  time = 0;
  private nextId = 1;
  private readonly timers = new Map<number, { at: number; callback: () => void }>();

  now(): number {
    return this.time;
  }

  setTimeout(callback: () => void, delayMs: number): unknown {
    const id = this.nextId++;
    this.timers.set(id, { at: this.time + Math.max(0, delayMs), callback });
    return id;
  }

  clearTimeout(handle: unknown): void {
    this.timers.delete(handle as number);
  }

  get pendingTimers(): number {
    return this.timers.size;
  }

  /** Продвигает время на ms, по порядку вызывая все таймеры, которые успевают сработать. */
  advance(ms: number): void {
    const end = this.time + ms;
    for (;;) {
      let dueId: number | null = null;
      let dueAt = Number.POSITIVE_INFINITY;
      for (const [id, timer] of this.timers) {
        if (timer.at <= end && timer.at < dueAt) {
          dueId = id;
          dueAt = timer.at;
        }
      }
      if (dueId === null) break;
      const timer = this.timers.get(dueId);
      this.timers.delete(dueId);
      this.time = dueAt;
      timer?.callback();
    }
    this.time = end;
  }
}

/** Даёт выполниться всем уже запланированным промисам. */
export function flushPromises(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
