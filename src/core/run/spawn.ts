import type { Rng } from './rng';

export interface SpawnSchedule {
  /** Веса тиров с начала забега: weights[i] — тир i + 1. */
  weights: readonly number[];
  /** Веса, к которым спавн плавно смещается во второй половине забега. */
  lateWeights: readonly number[];
  /** Секунда забега, с которой начинается смещение. */
  lateStartSec: number;
  /** Секунда, к которой веса полностью равны lateWeights. */
  lateFullSec: number;
}

function safeWeight(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/** Веса спавна на данной секунде забега (диздок, раздел 7: с третьей минуты — сдвиг к тирам 3–5). */
export function spawnWeightsAt(schedule: SpawnSchedule, elapsedSec: number): number[] {
  const span = schedule.lateFullSec - schedule.lateStartSec;
  const raw = span > 0 ? (elapsedSec - schedule.lateStartSec) / span : 1;
  const progress = Math.min(1, Math.max(0, raw));
  const length = Math.max(schedule.weights.length, schedule.lateWeights.length);
  const result: number[] = [];
  for (let i = 0; i < length; i += 1) {
    const early = safeWeight(schedule.weights[i]);
    const late = safeWeight(schedule.lateWeights[i]);
    result.push(early + (late - early) * progress);
  }
  return result;
}

/** Выбирает тир по весам (weights[i] — тир i + 1). Если все веса нулевые или битые — тир 1. */
export function pickTier(weights: readonly number[], random: number): number {
  const clean = weights.map(safeWeight);
  const total = clean.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return 1;
  let rest = random * total;
  for (let i = 0; i < clean.length; i += 1) {
    rest -= clean[i]!;
    if (rest < 0) return i + 1;
  }
  // Из-за округления random почти 1 может пройти весь список: берём последний тир с весом.
  for (let i = clean.length - 1; i >= 0; i -= 1) if (clean[i]! > 0) return i + 1;
  return 1;
}

/** Клавиша в очереди: тир и золотая ли она (диздок, раздел 3). */
export interface QueueItem {
  tier: number;
  golden: boolean;
}

export interface QueueOptions {
  /** Сколько следующих клавиш видно: одна, со вторым апгрейдом — две. */
  preview: number;
  /** Шанс, что выпавшая клавиша золотая. */
  goldenChance: number;
  /** Первые тиры по порядку (обучение), дальше — случайные. Они не бывают золотыми. */
  opening?: readonly number[];
}

/** Очередь клавиш: текущая висит над банкой, следующие видны в превью «Далее». */
export class KeyQueue {
  private readonly rng: Rng;
  private readonly schedule: SpawnSchedule;
  private readonly goldenChance: number;
  private readonly opening: number[];
  private currentItem: QueueItem;
  private readonly next: QueueItem[];

  constructor(rng: Rng, schedule: SpawnSchedule, options: QueueOptions, restore?: KeyQueueState) {
    this.rng = rng;
    this.schedule = schedule;
    this.goldenChance = options.goldenChance;
    this.opening = restore ? [] : [...(options.opening ?? [])];
    if (restore) {
      this.currentItem = { ...restore.current };
      this.next = restore.upcoming.slice(0, options.preview).map((item) => ({ ...item }));
    } else {
      this.currentItem = this.pick(0);
      this.next = [];
    }
    while (this.next.length < options.preview) this.next.push(this.pick(0));
  }

  /** Клавиша, которая сейчас висит над банкой. */
  get current(): QueueItem {
    return this.currentItem;
  }

  /** Следующие клавиши по порядку. */
  get upcoming(): readonly QueueItem[] {
    return this.next;
  }

  get state(): KeyQueueState {
    return {
      current: { ...this.currentItem },
      upcoming: this.next.map((item) => ({ ...item })),
    };
  }

  /** Заменить висящую клавишу (обучение, автотесты). Очередь не меняется. */
  replaceCurrent(tier: number, golden = false): void {
    this.currentItem = { tier, golden };
  }

  /** Текущая клавиша сброшена: следующая встаёт на её место, в конец очереди добавляется новая. */
  advance(elapsedSec: number): QueueItem {
    const next = this.next.shift();
    this.currentItem = next ?? this.pick(elapsedSec);
    this.next.push(this.pick(elapsedSec));
    return this.currentItem;
  }

  private pick(elapsedSec: number): QueueItem {
    const scripted = this.opening.shift();
    if (scripted !== undefined) return { tier: scripted, golden: false };
    const tier = pickTier(spawnWeightsAt(this.schedule, elapsedSec), this.rng.next());
    return { tier, golden: this.rng.next() < this.goldenChance };
  }
}

export interface KeyQueueState {
  current: QueueItem;
  upcoming: QueueItem[];
}
