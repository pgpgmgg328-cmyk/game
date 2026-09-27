export interface SchedulerClock {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface CloudWriteOptions {
  /** За это время частые изменения склеиваются в одну запись (по ТЗ — не дольше 1 с). */
  debounceMs: number;
  /** Окно лимита и число записей в нём. У Яндекса лимит setData — 100 запросов за 5 минут. */
  windowMs: number;
  maxWritesPerWindow: number;
  /** Паузы перед повторной попыткой после ошибки записи. */
  retryDelaysMs: readonly number[];
}

export const DEFAULT_CLOUD_WRITE_OPTIONS: CloudWriteOptions = {
  debounceMs: 1000,
  windowMs: 5 * 60 * 1000,
  // Запас от лимита 100: getData считается в том же лимите, а превышение — причина отказа (п. 1.14).
  maxWritesPerWindow: 90,
  retryDelaysMs: [2000, 5000, 15000, 30000, 60000],
};

/**
 * Решает, когда отправлять сохранение в облако. Каждая запись отправляет самые свежие данные,
 * поэтому пропущенные промежуточные версии не теряются, а лимит запросов не превышается.
 */
export class CloudWriteScheduler {
  private dirty = false;
  private urgent = false;
  private inFlight = false;
  private failures = 0;
  private timer: unknown = null;
  private timerAt = Number.POSITIVE_INFINITY;
  private writeTimes: number[] = [];
  private readonly write: () => Promise<void>;
  private readonly clock: SchedulerClock;
  private readonly options: CloudWriteOptions;

  constructor(
    write: () => Promise<void>,
    clock: SchedulerClock,
    options: CloudWriteOptions = DEFAULT_CLOUD_WRITE_OPTIONS,
  ) {
    this.write = write;
    this.clock = clock;
    this.options = options;
  }

  /** Есть изменения, которые ещё не дошли до облака. */
  get pending(): boolean {
    return this.dirty || this.inFlight;
  }

  /**
   * Данные изменились. urgent — отправить сразу, без ожидания (пауза, скрытие вкладки):
   * после скрытия вкладки браузер может заморозить таймеры, поэтому запись уходит синхронно.
   */
  request(urgent = false): void {
    this.dirty = true;
    if (!urgent) {
      this.schedule(this.options.debounceMs);
      return;
    }
    this.urgent = true;
    this.cancelTimer();
    this.attempt();
  }

  private attempt(): void {
    if (!this.dirty || this.inFlight) return;

    const now = this.clock.now();
    this.writeTimes = this.writeTimes.filter((time) => now - time < this.options.windowMs);
    const oldest = this.writeTimes[0];
    if (oldest !== undefined && this.writeTimes.length >= this.options.maxWritesPerWindow) {
      // Лимит исчерпан: ждём, пока самая старая запись выйдет из окна.
      this.schedule(oldest + this.options.windowMs - now);
      return;
    }

    this.dirty = false;
    this.urgent = false;
    this.inFlight = true;
    this.writeTimes.push(now);

    let result: Promise<void>;
    try {
      result = this.write();
    } catch (error) {
      result = Promise.reject(error);
    }
    result
      .then(
        () => {
          this.failures = 0;
        },
        () => {
          this.dirty = true;
          this.failures += 1;
        },
      )
      .then(() => {
        this.inFlight = false;
        if (!this.dirty) return;
        if (this.failures > 0) {
          this.schedule(this.retryDelay());
        } else if (this.urgent) {
          this.cancelTimer();
          this.attempt();
        } else {
          this.schedule(this.options.debounceMs);
        }
      });
  }

  private retryDelay(): number {
    const delays = this.options.retryDelaysMs;
    return delays[Math.min(this.failures, delays.length) - 1] ?? this.options.debounceMs;
  }

  private schedule(delayMs: number): void {
    const at = this.clock.now() + delayMs;
    if (this.timer !== null && this.timerAt <= at) return;
    this.cancelTimer();
    this.timerAt = at;
    this.timer = this.clock.setTimeout(() => {
      this.timer = null;
      this.timerAt = Number.POSITIVE_INFINITY;
      this.attempt();
    }, delayMs);
  }

  private cancelTimer(): void {
    if (this.timer === null) return;
    this.clock.clearTimeout(this.timer);
    this.timer = null;
    this.timerAt = Number.POSITIVE_INFINITY;
  }
}
