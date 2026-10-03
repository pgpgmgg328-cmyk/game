import {
  COMBO,
  DANGER,
  DROP,
  JAR,
  MERGE,
  PHYSICS,
  SHAKE,
  SPAWN,
  SQUISH,
  UNIT,
} from '../../config/balance';
import { mergeCoins } from '../../core/meta/coins';
import { runModifiers, type RunModifiers } from '../../core/meta/upgrades';
import { ComboCounter } from '../../core/run/combo';
import { CooldownMap } from '../../core/run/cooldown';
import { DangerTracker, type DangerSample, type DangerState } from '../../core/run/danger';
import {
  mergeScore,
  planMerges,
  type MergeCandidate,
  type MergeResult,
} from '../../core/run/merge';
import { Rng, randomSeed } from '../../core/run/rng';
import {
  NO_AD_BONUSES,
  RUN_SNAPSHOT_VERSION,
  type AdBonuses,
  type KeySnapshot,
  type MeteorSnapshot,
  type RunSnapshot,
} from '../../core/run/snapshot';
import { KeyQueue, type QueueItem, type SpawnSchedule } from '../../core/run/spawn';
import { formOf, maxTier, type ThemeData } from '../../themes';
import type { MatterBody, MatterCollisionEvent, MatterEngine, MatterModule } from './matter';

/**
 * «Карамелька» (мир 2): none — обычная клавиша; fresh — в карамели, ещё не прилипала;
 * stuck — держится за стенку; spent — отлипла и дальше обычная.
 */
export type CaramelPhase = 'none' | 'fresh' | 'stuck' | 'spent';

/**
 * Геометрия банки в единицах физики. Внутренность банки: x от 0 до width, y от 0 (верхний край
 * стенок) до height (дно). Висящая клавиша — над банкой, в отрицательных y.
 */
export interface JarGeometry {
  width: number;
  height: number;
  /** Толщина нарисованных стенок и дна. */
  wall: number;
  /** Линия опасности. */
  dangerY: number;
}

export interface RunKey {
  /** Номер клавиши в забеге: чем меньше, тем раньше она появилась. */
  readonly id: number;
  readonly tier: number;
  /** Золотая: блестит, а слияние с ней даёт монеты ×3. */
  readonly golden: boolean;
  readonly width: number;
  readonly height: number;
  readonly body: MatterBody;
  /** Клавиша упала: после сброса коснулась чего-нибудь. Только такие проверяются линией опасности. */
  settled: boolean;
  /** Клавиша слилась и убрана из банки. */
  removed: boolean;
  /** Время забега, когда клавиша появилась в банке (или отлипла от стенки и снова падает). */
  bornAt: number;
  /** Положение до последнего шага физики — чтобы рисовать плавно между шагами. */
  prevX: number;
  prevY: number;
  prevAngle: number;
  caramel: CaramelPhase;
  /** Когда (время забега) прилипшая «Карамелька» отлипнет. */
  stuckUntil: number;
}

/** «Метеорчик» в полёте (мир 3). */
export interface RunMeteor {
  readonly body: MatterBody;
  /** Диаметр в единицах физики. */
  readonly size: number;
  readonly bornAt: number;
  prevX: number;
  prevY: number;
  prevAngle: number;
}

export type RunEvent =
  /** Клавиша сброшена в банку. */
  | { type: 'drop'; key: RunKey }
  /** Над банкой появилась новая клавиша (после паузы сброса). */
  | { type: 'ready'; item: QueueItem }
  /** Клавиша впервые коснулась чего-нибудь после сброса. speed — скорость удара. */
  | { type: 'land'; key: RunKey; speed: number }
  /** Сильный удар о другую клавишу или банку. */
  | { type: 'impact'; key: RunKey; speed: number }
  | {
      type: 'merge';
      removed: readonly [RunKey, RunKey];
      /** Новая клавиша; null — мега-клац двух Пробелов. */
      created: RunKey | null;
      result: MergeResult;
      x: number;
      y: number;
      score: number;
      /** В слиянии была золотая клавиша: результат тоже золотой, монеты ×3. */
      golden: boolean;
      coins: number;
      /** Шаг комбо: 0 — одиночное слияние, дальше тон выше на полутон за шаг. */
      combo: number;
    }
  | { type: 'squish'; key: RunKey }
  /** «Встряска»: банку тряхнуло, клавиши подпрыгнули. */
  | { type: 'shake' }
  /** «Удаление»: клавиша убрана из банки. */
  | { type: 'remove'; key: RunKey }
  /** «Второй шанс»: верхние клавиши убраны, забег продолжается. */
  | { type: 'revive'; removed: readonly RunKey[] }
  /** За рекламу добавлен заряд инструмента. */
  | { type: 'charge'; tool: ToolId }
  /** «Карамелька» прилипла к стенке и отлипла. */
  | { type: 'stick'; key: RunKey }
  | { type: 'unstick'; key: RunKey }
  /** «Метеорчик» сброшен в банку. */
  | { type: 'meteorDrop'; meteor: RunMeteor }
  /** «Метеорчик» попал в клавишу: она мягко исчезла вместе с ним. */
  | { type: 'meteorHit'; key: RunKey; x: number; y: number }
  /** «Метеорчик» долетел до дна, никого не задев, и рассыпался блёстками. */
  | { type: 'meteorGone'; x: number; y: number }
  /** Изменилось состояние линии опасности. */
  | { type: 'danger'; warning: boolean }
  | { type: 'gameover' };

/** Инструменты забега. */
export type ToolId = 'shake' | 'remove';

export interface RunOptions {
  /** seed нового забега; по умолчанию случайный. */
  seed?: number;
  /** Продолжить сохранённый забег (его условия важнее modifiers). */
  snapshot?: RunSnapshot;
  /** Что дали апгрейды; по умолчанию — без апгрейдов. */
  modifiers?: RunModifiers;
  /** Первые тиры по порядку (обучение первого забега). */
  opening?: readonly number[];
  /** Какие клавиши выпадают; по умолчанию — SPAWN из config/balance.ts (флаг spawnWeights меняет веса). */
  spawn?: SpawnSchedule;
  /** Пробный забег в закрытом мире за рекламу (снимок помнит это сам). */
  trial?: boolean;
}

export interface RunStats {
  score: number;
  drops: number;
  merges: number;
  goldenMerges: number;
  megas: number;
  /** Монеты, заработанные в этом забеге. */
  coins: number;
  bestTier: number;
  elapsedMs: number;
}

/** Забег без апгрейдов. */
export const BASE_MODIFIERS: RunModifiers = runModifiers({
  shake: 0,
  remove: 0,
  preview: 0,
  squish: 0,
  golden: 0,
  jar: 0,
});

/** Толщина невидимых стенок физики: толстые стенки не пропускают даже очень быстрые клавиши. */
const PHYSICS_WALL = 400;
/** Невидимые стенки идут высоко над банкой: подброшенная клавиша не вылетит наружу. */
const WALL_EXTRA_HEIGHT = 4000;
/** Удар слабее этого не анимируется (единиц за шаг). */
const IMPACT_MIN_SPEED = 1.5;
/** Страховка: «Метеорчик», который так и не коснулся клавиши или дна, рассыпается через это время. */
const METEOR_MAX_MS = 6000;
/** «Карамелька» прилипает, когда до стенки меньше этого (единицы физики). */
const CARAMEL_SLOP = 5;

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  // «|| 0» превращает -0 в 0: в снимке не нужны отрицательные нули.
  return Math.round(value * factor) / factor || 0;
}

/**
 * Забег: физика банки на Matter.js, очередь клавиш, слияния, линия опасности и счёт.
 * Не зависит от Phaser: сцена только рисует состояние и передаёт ввод. Поэтому весь забег
 * можно проверить тестами и ботом без браузера.
 */
export class Run {
  readonly theme: ThemeData;
  readonly jar: JarGeometry;
  readonly seed: number;
  /** Пробный забег в закрытом мире (за рекламу): мир от него не открывается. */
  readonly trial: boolean;

  private readonly matter: MatterModule;
  private readonly engine: MatterEngine;
  private readonly rng: Rng;
  /** Случайность для «Встряски»: отдельно, чтобы не менять очередь клавиш. */
  private readonly fxRng: Rng;
  private readonly queue: KeyQueue;
  private readonly squishPower: number;
  private readonly goldenChance: number;
  private readonly preview: number;
  private shakesLeft: number;
  private removesLeft: number;
  private readonly adBonuses: AdBonuses;
  private readonly danger = new DangerTracker(DANGER.overflowMs);
  private readonly combo = new ComboCounter(COMBO.windowMs, COMBO.maxSteps);
  private readonly squishCooldown = new CooldownMap(SQUISH.cooldownMs);
  private readonly listeners = new Set<(event: RunEvent) => void>();
  private readonly keyMap = new Map<number, RunKey>();
  private readonly byBody = new Map<number, RunKey>();
  private readonly maxTier: number;
  /** Страховка «клавиша упала»: при слабой гравитации клавиши падают дольше (время ∝ 1/√g). */
  private readonly settleAfterMs: number;
  /** Дно банки: о него рассыпается «Метеорчик», если ни в кого не попал. */
  private floorId = -1;
  /** Боковые стенки банки: касание стенки — ещё не «упала». */
  private wallIds = new Set<number>();
  private meteor: RunMeteor | null = null;
  /** Чего коснулся «Метеорчик» на этом шаге: клавиши, дна (null) или ничего (undefined). */
  private meteorTouch: RunKey | null | undefined = undefined;

  private nextId = 1;
  private accumulator = 0;
  private aim: number;
  private readyAt = 0;
  private dangerState: DangerState = { warning: false, overflow: false, longestMs: 0 };
  private finished = false;
  private destroyed = false;
  private candidates: MergeCandidate[] = [];
  private pendingEvents: RunEvent[] = [];
  private readonly stats: RunStats;

  constructor(matter: MatterModule, theme: ThemeData, options: RunOptions = {}) {
    this.matter = matter;
    this.theme = theme;
    this.maxTier = maxTier(theme);
    this.settleAfterMs = PHYSICS.settleAfterMs / Math.sqrt(theme.physics.gravityScale);
    const snapshot = options.snapshot;
    const modifiers = options.modifiers ?? BASE_MODIFIERS;
    const saved = snapshot?.modifiers;
    this.jar = {
      width: saved?.jarWidth ?? modifiers.jarWidth,
      height: JAR.height,
      wall: JAR.wall,
      dangerY: JAR.dangerDepth,
    };
    this.squishPower = saved?.squishPower ?? modifiers.squishPower;
    this.goldenChance = saved?.goldenChance ?? modifiers.goldenChance;
    this.preview = saved?.preview ?? modifiers.preview;
    this.shakesLeft = snapshot?.shakes ?? modifiers.shakes;
    this.removesLeft = snapshot?.removes ?? modifiers.removes;
    this.adBonuses = { ...(snapshot?.adBonuses ?? NO_AD_BONUSES) };

    this.seed = snapshot?.seed ?? options.seed ?? randomSeed();
    this.trial = snapshot?.trial ?? options.trial ?? false;
    this.rng = new Rng(snapshot?.rng ?? this.seed);
    this.fxRng = new Rng((this.seed ^ 0x5bd1e995) >>> 0);
    const { caramel, meteor } = theme.specials;
    this.queue = new KeyQueue(
      this.rng,
      options.spawn ?? SPAWN,
      {
        preview: this.preview,
        goldenChance: this.goldenChance,
        opening: options.opening,
        caramelChance: caramel?.chance,
        meteorEveryMs: meteor?.everyMs,
      },
      snapshot
        ? {
            current: snapshot.current,
            upcoming: snapshot.upcoming,
            // Снимок без «Метеорчика» (старый) — отсчёт с того времени забега, где он прерван.
            meteorAt: snapshot.meteorAt || undefined,
          }
        : undefined,
    );
    this.stats = {
      score: snapshot?.score ?? 0,
      drops: snapshot?.drops ?? 0,
      merges: snapshot?.merges ?? 0,
      goldenMerges: snapshot?.goldenMerges ?? 0,
      megas: snapshot?.megas ?? 0,
      coins: snapshot?.coins ?? 0,
      bestTier: snapshot?.bestTier ?? 1,
      elapsedMs: snapshot?.elapsedMs ?? 0,
    };

    this.engine = matter.Engine.create();
    this.engine.gravity.x = 0;
    this.engine.gravity.y = PHYSICS.gravity * theme.physics.gravityScale;
    this.engine.positionIterations = PHYSICS.positionIterations;
    this.engine.velocityIterations = PHYSICS.velocityIterations;
    this.createWalls();
    matter.Events.on(this.engine, 'collisionStart', (event) => this.onCollision(event, true));
    matter.Events.on(this.engine, 'collisionActive', (event) => this.onCollision(event, false));

    this.aim = this.clampAim(snapshot?.aimX ?? this.jar.width / 2);
    snapshot?.keys.forEach((key) => this.restoreKey(key));
    if (snapshot?.meteor) this.restoreMeteor(snapshot.meteor);
  }

  // ── Состояние для сцены ────────────────────────────────────────────────────────────────

  get keys(): IterableIterator<RunKey> {
    return this.keyMap.values();
  }

  get keyCount(): number {
    return this.keyMap.size;
  }

  get score(): number {
    return this.stats.score;
  }

  get elapsedMs(): number {
    return this.stats.elapsedMs;
  }

  getStats(): RunStats {
    return { ...this.stats };
  }

  get over(): boolean {
    return this.finished;
  }

  get dangerWarning(): boolean {
    return this.dangerState.warning;
  }

  /** Сколько миллисекунд над линией самая «долгая» клавиша (для нарастающего мигания). */
  get dangerMs(): number {
    return this.dangerState.longestMs;
  }

  /** Клавиша над банкой. */
  get current(): QueueItem {
    return this.queue.current;
  }

  get currentTier(): number {
    return this.queue.current.tier;
  }

  /** Следующие клавиши (превью «Далее»). */
  get upcoming(): readonly QueueItem[] {
    return this.queue.upcoming;
  }

  /** «Метеорчик» в полёте или null. */
  get meteorInFlight(): RunMeteor | null {
    return this.meteor;
  }

  /** Размер висящей клавиши или «Метеорчика» в единицах физики. */
  get currentSize(): { width: number; height: number } {
    return this.itemSize(this.queue.current);
  }

  /** Размер того, что стоит в очереди: клавиши или «Метеорчика». */
  itemSize(item: QueueItem): { width: number; height: number } {
    if (!item.meteor) return this.sizeOf(item.tier);
    const size = this.meteorSize();
    return { width: size, height: size };
  }

  /** Оставшиеся заряды «Встряски» и «Удаления». */
  get charges(): { shakes: number; removes: number } {
    return { shakes: this.shakesLeft, removes: this.removesLeft };
  }

  /** Какие бонусы за рекламу уже взяты в этом забеге. */
  get bonuses(): Readonly<AdBonuses> {
    return this.adBonuses;
  }

  /** Можно предложить «Второй шанс»: банка переполнена, шанса ещё не было и есть что убрать. */
  get canRevive(): boolean {
    return this.finished && !this.adBonuses.revive && this.keyMap.size > 0;
  }

  /** Можно добавить заряд за рекламу: заряды кончились, а этот бонус в забеге ещё не брали. */
  canAddCharge(tool: ToolId): boolean {
    const left = tool === 'shake' ? this.shakesLeft : this.removesLeft;
    return !this.finished && left === 0 && !this.adBonuses[tool];
  }

  /** Висящую клавишу уже можно сбросить (прошла пауза после прошлого сброса). */
  get canDrop(): boolean {
    return !this.finished && this.stats.elapsedMs >= this.readyAt;
  }

  get aimX(): number {
    return this.aim;
  }

  /** Центр висящей клавиши (или «Метеорчика») по y. */
  hangY(item: QueueItem = this.queue.current): number {
    return -JAR.hangGap - this.itemSize(item).height / 2;
  }

  /** Размер клавиши тира в единицах физики. */
  sizeOf(tier: number): { width: number; height: number } {
    const form = formOf(this.theme, tier);
    return { width: form.size.w * UNIT, height: form.size.h * UNIT };
  }

  on(listener: (event: RunEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // ── Ввод ───────────────────────────────────────────────────────────────────────────────

  /** Прицел: x центра висящей клавиши. Клавиша не выходит за стенки банки. */
  setAim(x: number): void {
    this.aim = this.clampAim(x);
  }

  moveAim(dx: number): void {
    this.setAim(this.aim + dx);
  }

  /** Сбросить висящую клавишу. false — ещё идёт пауза после прошлого сброса или забег окончен. */
  drop(): boolean {
    if (!this.canDrop) return false;
    const item = this.queue.current;
    let event: RunEvent;
    if (item.meteor) {
      event = { type: 'meteorDrop', meteor: this.launchMeteor(this.aim, this.hangY(item)) };
    } else {
      const { tier, golden } = item;
      const caramel = item.caramel ? 'fresh' : 'none';
      const key = this.addKey(tier, golden, this.aim, this.hangY(item), 0, caramel);
      key.settled = false;
      this.stats.bestTier = Math.max(this.stats.bestTier, tier);
      event = { type: 'drop', key };
    }
    this.stats.drops += 1;
    this.queue.advance(this.stats.elapsedMs / 1000);
    this.readyAt = this.stats.elapsedMs + DROP.cooldownMs;
    this.aim = this.clampAim(this.aim);
    this.emit(event);
    return true;
  }

  /**
   * Клавиша под точкой (x, y) в единицах физики. Для пальца есть допуск slop:
   * если точка рядом с маленькой клавишей, считаем, что попали в неё.
   */
  keyAt(x: number, y: number, slop = 0): RunKey | null {
    const alive = [...this.keyMap.values()];
    const hit = this.matter.Query.point(
      alive.map((key) => key.body),
      { x, y },
    )[0];
    if (hit) return this.byBody.get(hit.id) ?? null;
    if (slop <= 0) return null;
    let best: RunKey | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const key of alive) {
      const { min, max } = key.body.bounds;
      if (x < min.x - slop || x > max.x + slop || y < min.y - slop || y > max.y + slop) continue;
      const distance = Math.hypot(key.body.position.x - x, key.body.position.y - y);
      if (distance < bestDistance) {
        best = key;
        bestDistance = distance;
      }
    }
    return best;
  }

  /** Тап-сквиш: клавиша подпрыгивает. Перезарядка 0,3 с на каждую клавишу. */
  squish(key: RunKey, tapX: number): boolean {
    if (this.finished || key.removed) return false;
    if (!this.squishCooldown.tryUse(key.id, this.stats.elapsedMs)) return false;
    // Прилипшая «Карамелька» только сминается и пищит: стенка держит её крепко.
    if (key.caramel === 'stuck') {
      this.emit({ type: 'squish', key });
      return true;
    }
    const { Body } = this.matter;
    const areaInUnits = (key.width * key.height) / (UNIT * UNIT);
    const lift = (SQUISH.impulse * this.squishPower) / areaInUnits ** SQUISH.sizeExponent;
    // Тап сбоку чуть толкает клавишу в другую сторону: это маленький инструмент для скилла.
    const side = Math.max(-1, Math.min(1, (key.body.position.x - tapX) / (key.width / 2)));
    Body.setVelocity(key.body, {
      x: key.body.velocity.x + side * lift * SQUISH.sidePush,
      y: Math.min(key.body.velocity.y, 0) - lift,
    });
    this.emit({ type: 'squish', key });
    return true;
  }

  /** «Встряска»: все клавиши подпрыгивают и перемешиваются. false — зарядов нет. */
  shake(): boolean {
    if (this.finished || this.shakesLeft <= 0) return false;
    this.shakesLeft -= 1;
    const { Body } = this.matter;
    for (const key of this.keyMap.values()) {
      if (key.caramel === 'stuck') continue;
      const areaInUnits = (key.width * key.height) / (UNIT * UNIT);
      const scale = 1 / areaInUnits ** SQUISH.sizeExponent;
      Body.setVelocity(key.body, {
        x: key.body.velocity.x + this.fxRng.range(-SHAKE.side, SHAKE.side) * scale,
        y: Math.min(key.body.velocity.y, 0) - SHAKE.lift * scale * this.fxRng.range(0.7, 1.2),
      });
      Body.setAngularVelocity(key.body, this.fxRng.range(-SHAKE.spin, SHAKE.spin));
    }
    this.emit({ type: 'shake' });
    return true;
  }

  /** «Удаление»: убрать клавишу из банки. false — зарядов нет. */
  removeKey(key: RunKey): boolean {
    if (this.finished || key.removed || this.removesLeft <= 0) return false;
    this.removesLeft -= 1;
    this.detach(key);
    this.emit({ type: 'remove', key });
    return true;
  }

  /**
   * «Второй шанс» (диздок, раздел 8): убрать count верхних клавиш и продолжить переполненный
   * забег. Один раз за забег; false — нельзя (забег идёт, шанс уже был или банка пуста).
   */
  revive(count: number): boolean {
    if (!this.canRevive) return false;
    const removed = [...this.keyMap.values()]
      .sort((a, b) => a.body.bounds.min.y - b.body.bounds.min.y)
      .slice(0, Math.max(1, count));
    removed.forEach((key) => this.detach(key));
    this.adBonuses.revive = true;
    this.finished = false;
    this.accumulator = 0;
    this.danger.reset();
    this.dangerState = { warning: false, overflow: false, longestMs: 0 };
    this.emit({ type: 'revive', removed });
    this.emit({ type: 'danger', warning: false });
    return true;
  }

  /** «+1 Встряска» или «+1 Удаление» за рекламу, когда заряды кончились: раз за забег на каждый. */
  addCharge(tool: ToolId): boolean {
    if (!this.canAddCharge(tool)) return false;
    if (tool === 'shake') this.shakesLeft += 1;
    else this.removesLeft += 1;
    this.adBonuses[tool] = true;
    this.emit({ type: 'charge', tool });
    return true;
  }

  // ── Время ──────────────────────────────────────────────────────────────────────────────

  /**
   * Продвигает забег на dtMs реального времени фиксированными шагами физики.
   * Возвращает долю следующего шага (0…1) для плавной отрисовки между шагами.
   */
  update(dtMs: number): number {
    if (this.finished || this.destroyed) return 0;
    const step = PHYSICS.stepMs;
    this.accumulator = Math.min(
      this.accumulator + Math.max(0, dtMs),
      step * PHYSICS.maxStepsPerFrame,
    );
    while (this.accumulator >= step && !this.finished) {
      this.accumulator -= step;
      this.stepOnce();
    }
    return this.finished ? 0 : this.accumulator / step;
  }

  /** Сделать ровно n шагов физики (боту, тестам и снимкам экрана). */
  stepMany(count: number): void {
    for (let i = 0; i < count && !this.finished && !this.destroyed; i += 1) this.stepOnce();
  }

  // ── Снимок ─────────────────────────────────────────────────────────────────────────────

  snapshot(): RunSnapshot {
    const keys: KeySnapshot[] = [...this.keyMap.values()]
      .sort((a, b) => a.id - b.id)
      .map((key) => {
        const { tier, golden, body } = key;
        const saved: KeySnapshot = {
          tier,
          golden,
          x: round(body.position.x, 2),
          y: round(body.position.y, 2),
          angle: round(body.angle, 4),
          vx: round(body.velocity.x, 3),
          vy: round(body.velocity.y, 3),
          spin: round(body.angularVelocity, 4),
        };
        if (key.caramel === 'fresh') saved.caramel = 'fresh';
        if (key.caramel === 'stuck') {
          saved.caramel = 'stuck';
          saved.stuckMs = Math.max(0, Math.round(key.stuckUntil - this.stats.elapsedMs));
        }
        return saved;
      });
    const flying = this.meteor?.body;
    const meteor: MeteorSnapshot | null = flying
      ? {
          x: round(flying.position.x, 2),
          y: round(flying.position.y, 2),
          vx: round(flying.velocity.x, 3),
          vy: round(flying.velocity.y, 3),
        }
      : null;
    return {
      v: RUN_SNAPSHOT_VERSION,
      world: this.theme.id,
      seed: this.seed,
      rng: this.rng.state,
      score: this.stats.score,
      elapsedMs: Math.round(this.stats.elapsedMs),
      drops: this.stats.drops,
      merges: this.stats.merges,
      goldenMerges: this.stats.goldenMerges,
      megas: this.stats.megas,
      coins: this.stats.coins,
      bestTier: this.stats.bestTier,
      current: { ...this.queue.current },
      upcoming: this.queue.upcoming.map((item) => ({ ...item })),
      aimX: round(this.aim, 2),
      modifiers: {
        jarWidth: this.jar.width,
        preview: this.preview,
        squishPower: this.squishPower,
        goldenChance: this.goldenChance,
      },
      shakes: this.shakesLeft,
      removes: this.removesLeft,
      adBonuses: { ...this.adBonuses },
      keys,
      meteorAt: Math.round(this.queue.state.meteorAt ?? 0),
      meteor,
      trial: this.trial,
    };
  }

  /** Положить клавишу в банку (для обучения в M2, автотестов и снимков экрана). */
  placeKey(tier: number, x: number, y: number, golden = false): RunKey {
    const key = this.addKey(tier, golden, x, y, 0);
    this.stats.bestTier = Math.max(this.stats.bestTier, tier);
    return key;
  }

  /** Задать висящую клавишу (для обучения в M2 и автотестов). */
  setCurrentTier(tier: number, golden = false): void {
    this.queue.replaceCurrent(tier, golden);
    this.aim = this.clampAim(this.aim);
  }

  /** Задать висящую «Карамельку» или «Метеорчик» (автотесты и скриншоты). */
  setCurrentSpecial(kind: 'caramel' | 'meteor', tier = 1): void {
    this.queue.replaceCurrentItem(
      kind === 'meteor'
        ? { tier: 1, golden: false, meteor: true }
        : { tier, golden: false, caramel: true },
    );
    this.aim = this.clampAim(this.aim);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.listeners.clear();
    this.matter.Engine.clear(this.engine);
    this.keyMap.clear();
    this.byBody.clear();
    this.meteor = null;
  }

  // ── Внутреннее ─────────────────────────────────────────────────────────────────────────

  private stepOnce(): void {
    const { Body, Engine } = this.matter;
    for (const key of this.keyMap.values()) {
      key.prevX = key.body.position.x;
      key.prevY = key.body.position.y;
      key.prevAngle = key.body.angle;
    }
    if (this.meteor) {
      this.meteor.prevX = this.meteor.body.position.x;
      this.meteor.prevY = this.meteor.body.position.y;
      this.meteor.prevAngle = this.meteor.body.angle;
    }

    const wasReady = this.canDrop;
    this.candidates = [];
    Engine.update(this.engine, PHYSICS.stepMs);
    this.stats.elapsedMs += PHYSICS.stepMs;

    // Клавиши быстро перестают крутиться и оседают (диздок: сильное угловое демпфирование).
    for (const key of this.keyMap.values()) {
      if (key.caramel === 'stuck') continue;
      Body.setAngularVelocity(key.body, key.body.angularVelocity * (1 - PHYSICS.angularDamping));
      if (!key.settled && this.stats.elapsedMs - key.bornAt >= this.settleAfterMs) {
        key.settled = true;
      }
    }

    this.flushEvents();
    this.applyMerges();
    this.applyCaramel();
    this.applyMeteor();
    this.updateDanger();
    if (!wasReady && this.canDrop) this.emit({ type: 'ready', item: this.queue.current });
  }

  private onCollision(event: MatterCollisionEvent, started: boolean): void {
    for (const pair of event.pairs) {
      const bodyA = pair.bodyA.parent ?? pair.bodyA;
      const bodyB = pair.bodyB.parent ?? pair.bodyB;
      const meteor = this.meteor?.body.id;
      if (meteor !== undefined && (bodyA.id === meteor || bodyB.id === meteor)) {
        this.touchMeteor(bodyA.id === meteor ? bodyB : bodyA);
        continue;
      }
      const keyA = this.byBody.get(bodyA.id);
      const keyB = this.byBody.get(bodyB.id);
      if (keyA && keyB && keyA.tier === keyB.tier && !keyA.removed && !keyB.removed) {
        this.candidates.push({ a: keyA.id, b: keyB.id, tier: keyA.tier });
      }
      if (!started) continue;
      const speed = Math.hypot(
        bodyA.velocity.x - bodyB.velocity.x,
        bodyA.velocity.y - bodyB.velocity.y,
      );
      const sides: [RunKey | undefined, number][] = [
        [keyA, bodyB.id],
        [keyB, bodyA.id],
      ];
      for (const [key, other] of sides) {
        if (!key || key.removed) continue;
        if (!key.settled) {
          // Задела стенку — ещё летит: «упала» — это на дно или на другую клавишу.
          if (this.wallIds.has(other)) continue;
          key.settled = true;
          this.pendingEvents.push({ type: 'land', key, speed });
        } else if (speed >= IMPACT_MIN_SPEED) {
          this.pendingEvents.push({ type: 'impact', key, speed });
        }
      }
    }
  }

  private flushEvents(): void {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    events.forEach((event) => this.emit(event));
  }

  private applyMerges(): void {
    if (this.candidates.length === 0) return;
    const { Body } = this.matter;
    for (const merge of planMerges(this.candidates, this.maxTier)) {
      const a = this.keyMap.get(merge.a);
      const b = this.keyMap.get(merge.b);
      if (!a || !b) continue;
      const x = (a.body.position.x + b.body.position.x) / 2;
      const y = (a.body.position.y + b.body.position.y) / 2;
      const vx = (a.body.velocity.x + b.body.velocity.x) / 2;
      const vy = (a.body.velocity.y + b.body.velocity.y) / 2;
      this.detach(a);
      this.detach(b);
      // Если хоть одна из клавиш золотая, результат тоже золотой (диздок, раздел 3).
      const golden = a.golden || b.golden;

      let created: RunKey | null = null;
      if (merge.result.kind === 'form') {
        const tier = merge.result.tier;
        const { width } = this.sizeOf(tier);
        const cx = Math.min(this.jar.width - width / 2, Math.max(width / 2, x));
        created = this.addKey(tier, golden, cx, y, 0);
        Body.setVelocity(created.body, { x: vx * 0.5, y: Math.min(vy, 0) - MERGE.upSpeed });
        this.stats.bestTier = Math.max(this.stats.bestTier, tier);
      } else {
        this.stats.megas += 1;
      }
      const score = mergeScore(merge.result);
      const coins = mergeCoins(merge.result, golden);
      this.stats.score += score;
      this.stats.coins += coins;
      this.stats.merges += 1;
      if (golden) this.stats.goldenMerges += 1;
      const combo = this.combo.hit(this.stats.elapsedMs);
      this.emit({
        type: 'merge',
        removed: [a, b],
        created,
        result: merge.result,
        x,
        y,
        score,
        golden,
        coins,
        combo,
      });
    }
  }

  /** Чего коснулся «Метеорчик»: важно только первое касание клавиши или дна. */
  private touchMeteor(other: MatterBody): void {
    if (this.meteorTouch !== undefined) return;
    const key = this.byBody.get(other.id);
    if (key && !key.removed) this.meteorTouch = key;
    else if (other.id === this.floorId) this.meteorTouch = null;
  }

  /**
   * «Карамелька» (диздок, раздел 5): дотронувшись до стенки банки, держится за неё holdMs —
   * тело становится неподвижным, — потом отлипает и падает обычной клавишей. «Дотронулась» —
   * край ближе CARAMEL_SLOP к стенке: клавиша, падающая вплотную к стенке, её не задевает.
   */
  private applyCaramel(): void {
    const { Body } = this.matter;
    const holdMs = this.theme.specials.caramel?.holdMs ?? 0;
    for (const key of this.keyMap.values()) {
      if (key.caramel === 'stuck' && this.stats.elapsedMs >= key.stuckUntil) {
        this.unstick(key);
        continue;
      }
      // Прилипает только ниже линии опасности: иначе клавиши, упавшие на неё сверху,
      // быстро закончили бы забег — для ребёнка это ловушка.
      if (key.caramel !== 'fresh' || key.body.bounds.min.y < this.jar.dangerY) continue;
      const { min, max } = key.body.bounds;
      if (min.x > CARAMEL_SLOP && max.x < this.jar.width - CARAMEL_SLOP) continue;
      Body.setStatic(key.body, true);
      key.caramel = 'stuck';
      key.stuckUntil = this.stats.elapsedMs + holdMs;
      this.emit({ type: 'stick', key });
    }
  }

  private unstick(key: RunKey): void {
    this.matter.Body.setStatic(key.body, false);
    key.caramel = 'spent';
    // Клавиша снова падает: линия опасности смотрит на неё, только когда она опять осядет.
    key.settled = false;
    key.bornAt = this.stats.elapsedMs;
    this.emit({ type: 'unstick', key });
  }

  /**
   * «Метеорчик» (диздок, раздел 5): клавиша, в которую он попал, исчезает вместе с ним;
   * долетел до дна, никого не задев, — рассыпается сам.
   */
  private applyMeteor(): void {
    const meteor = this.meteor;
    if (!meteor) return;
    const touch = this.meteorTouch;
    this.meteorTouch = undefined;
    const { x, y } = meteor.body.position;
    if (touch && !touch.removed) {
      this.removeMeteor();
      this.detach(touch);
      this.emit({ type: 'meteorHit', key: touch, x, y });
      return;
    }
    if (touch === null || touch?.removed || this.stats.elapsedMs - meteor.bornAt > METEOR_MAX_MS) {
      this.removeMeteor();
      this.emit({ type: 'meteorGone', x, y });
    }
  }

  private meteorSize(): number {
    return (this.theme.specials.meteor?.size ?? 1) * UNIT;
  }

  private launchMeteor(x: number, y: number): RunMeteor {
    const { Bodies, Composite } = this.matter;
    const size = this.meteorSize();
    const body = Bodies.circle(x, y, size / 2, {
      restitution: 0.1,
      friction: PHYSICS.friction,
      frictionAir: PHYSICS.frictionAir,
    });
    Composite.add(this.engine.world, body);
    this.meteor = { body, size, bornAt: this.stats.elapsedMs, prevX: x, prevY: y, prevAngle: 0 };
    this.meteorTouch = undefined;
    return this.meteor;
  }

  private restoreMeteor(saved: MeteorSnapshot): void {
    const meteor = this.launchMeteor(saved.x, saved.y);
    this.matter.Body.setVelocity(meteor.body, { x: saved.vx, y: saved.vy });
  }

  private removeMeteor(): void {
    if (!this.meteor) return;
    this.matter.Composite.remove(this.engine.world, this.meteor.body);
    this.meteor = null;
    this.meteorTouch = undefined;
  }

  private updateDanger(): void {
    const samples: DangerSample[] = [];
    for (const key of this.keyMap.values()) {
      // Прилипшая «Карамелька» висит на стенке, а не лежит в куче: её линия не считает.
      if (key.settled && key.caramel !== 'stuck') {
        samples.push({ id: key.id, above: key.body.bounds.min.y < this.jar.dangerY });
      }
    }
    const previous = this.dangerState;
    this.dangerState = this.danger.update(samples, PHYSICS.stepMs);
    if (previous.warning !== this.dangerState.warning) {
      this.emit({ type: 'danger', warning: this.dangerState.warning });
    }
    if (this.dangerState.overflow) {
      this.finished = true;
      this.emit({ type: 'gameover' });
    }
  }

  private addKey(
    tier: number,
    golden: boolean,
    x: number,
    y: number,
    angle: number,
    caramel: CaramelPhase = 'none',
  ): RunKey {
    const { Bodies, Body, Composite } = this.matter;
    const { width, height } = this.sizeOf(tier);
    const body = Bodies.rectangle(x, y, width, height, {
      chamfer: {
        radius: Math.min(width, height) * PHYSICS.chamferRatio,
        qualityMin: 2,
        qualityMax: 5,
      },
      restitution: this.theme.physics.restitution,
      friction: PHYSICS.friction,
      frictionStatic: PHYSICS.frictionStatic,
      frictionAir: PHYSICS.frictionAir,
      angle,
    });
    Body.setInertia(body, body.inertia * PHYSICS.inertiaScale);
    Composite.add(this.engine.world, body);
    const key: RunKey = {
      id: this.nextId,
      tier,
      golden,
      width,
      height,
      body,
      settled: true,
      removed: false,
      bornAt: this.stats.elapsedMs,
      prevX: x,
      prevY: y,
      prevAngle: angle,
      caramel,
      stuckUntil: 0,
    };
    this.nextId += 1;
    this.keyMap.set(key.id, key);
    this.byBody.set(body.id, key);
    return key;
  }

  private restoreKey(saved: KeySnapshot): void {
    const caramel = saved.caramel ?? 'none';
    const key = this.addKey(saved.tier, saved.golden, saved.x, saved.y, saved.angle, caramel);
    if (caramel === 'stuck') {
      this.matter.Body.setStatic(key.body, true);
      key.stuckUntil = this.stats.elapsedMs + (saved.stuckMs ?? 0);
      return;
    }
    this.matter.Body.setVelocity(key.body, { x: saved.vx, y: saved.vy });
    this.matter.Body.setAngularVelocity(key.body, saved.spin);
  }

  /** Убрать клавишу из банки и из физики. */
  private detach(key: RunKey): void {
    key.removed = true;
    this.matter.Composite.remove(this.engine.world, key.body);
    this.keyMap.delete(key.id);
    this.byBody.delete(key.body.id);
    this.squishCooldown.forget(key.id);
  }

  private createWalls(): void {
    const { Bodies, Composite } = this.matter;
    const { width, height } = this.jar;
    const wallHeight = height + WALL_EXTRA_HEIGHT + PHYSICS_WALL;
    const wallCenterY = height + PHYSICS_WALL - wallHeight / 2;
    const options = {
      isStatic: true,
      friction: PHYSICS.friction,
      frictionStatic: PHYSICS.frictionStatic,
      restitution: this.theme.physics.restitution,
    };
    const left = Bodies.rectangle(
      -PHYSICS_WALL / 2,
      wallCenterY,
      PHYSICS_WALL,
      wallHeight,
      options,
    );
    const right = Bodies.rectangle(
      width + PHYSICS_WALL / 2,
      wallCenterY,
      PHYSICS_WALL,
      wallHeight,
      options,
    );
    // Стенки — гладкое стекло (Matter берёт меньшее трение из пары). Ставим после создания:
    // неподвижному телу Matter сам выставляет трение 1, не глядя на настройки.
    for (const wall of [left, right]) {
      wall.friction = PHYSICS.wallFriction;
      wall.frictionStatic = 0;
    }
    const floor = Bodies.rectangle(
      width / 2,
      height + PHYSICS_WALL / 2,
      width + PHYSICS_WALL * 2,
      PHYSICS_WALL,
      options,
    );
    this.floorId = floor.id;
    this.wallIds = new Set([left.id, right.id]);
    Composite.add(this.engine.world, [left, right, floor]);
  }

  private clampAim(x: number): number {
    const half = this.currentSize.width / 2;
    return Math.min(this.jar.width - half, Math.max(half, x));
  }

  private emit(event: RunEvent): void {
    this.listeners.forEach((listener) => listener(event));
  }
}
