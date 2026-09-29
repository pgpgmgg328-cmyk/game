import { describe, expect, it } from 'vitest';
import { SCORE, SPAWN } from '../src/config/balance';
import { ComboCounter, semitoneRatio } from '../src/core/run/combo';
import { CooldownMap } from '../src/core/run/cooldown';
import { DangerTracker } from '../src/core/run/danger';
import { mergeResult, mergeScore, planMerges } from '../src/core/run/merge';
import { Rng } from '../src/core/run/rng';
import { offerableSnapshot, readRunSnapshot, type RunSnapshot } from '../src/core/run/snapshot';
import { KeyQueue, pickTier, spawnWeightsAt } from '../src/core/run/spawn';

describe('Rng', () => {
  it('один seed — одна последовательность, состояние продолжает её', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const first = [a.next(), a.next(), a.next()];
    expect([b.next(), b.next(), b.next()]).toEqual(first);
    const resumed = new Rng(a.state);
    expect(resumed.next()).toBe(a.next());
  });

  it('числа в [0, 1) и int в границах', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 1000; i += 1) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      const int = rng.int(3, 5);
      expect([3, 4, 5]).toContain(int);
    }
  });
});

describe('спавн', () => {
  it('веса до третьей минуты — из диздока, потом плавно смещаются', () => {
    expect(spawnWeightsAt(SPAWN, 0)).toEqual([...SPAWN.weights]);
    expect(spawnWeightsAt(SPAWN, SPAWN.lateStartSec)).toEqual([...SPAWN.weights]);
    expect(spawnWeightsAt(SPAWN, SPAWN.lateFullSec)).toEqual([...SPAWN.lateWeights]);
    expect(spawnWeightsAt(SPAWN, 10_000)).toEqual([...SPAWN.lateWeights]);
    const middle = spawnWeightsAt(SPAWN, (SPAWN.lateStartSec + SPAWN.lateFullSec) / 2);
    middle.forEach((weight, i) =>
      expect(weight).toBeCloseTo((SPAWN.weights[i]! + SPAWN.lateWeights[i]!) / 2),
    );
  });

  it('pickTier выбирает по весам и не выходит за список', () => {
    expect(pickTier([1, 0, 0], 0.99)).toBe(1);
    expect(pickTier([0, 0, 5], 0)).toBe(3);
    expect(pickTier([1, 1], 0.49)).toBe(1);
    expect(pickTier([1, 1], 0.5)).toBe(2);
    expect(pickTier([1, 1], 0.9999999999)).toBe(2);
    expect(pickTier([], 0.5)).toBe(1);
    expect(pickTier([Number.NaN, -3], 0.5)).toBe(1);
  });

  it('частоты тиров совпадают с весами', () => {
    const rng = new Rng(123);
    const counts = [0, 0, 0, 0, 0];
    const total = 50_000;
    for (let i = 0; i < total; i += 1) counts[pickTier(SPAWN.weights, rng.next()) - 1]! += 1;
    counts.forEach((count, i) => expect(count / total).toBeCloseTo(SPAWN.weights[i]! / 100, 1));
  });

  it('очередь: текущая клавиша, превью, продолжение из состояния', () => {
    const rng = new Rng(5);
    const queue = new KeyQueue(rng, SPAWN, 1);
    expect(queue.upcoming).toHaveLength(1);
    const next = queue.upcoming[0];
    expect(queue.advance(0)).toBe(next);

    const copy = new KeyQueue(new Rng(rng.state), SPAWN, 1, queue.state);
    expect(copy.current).toBe(queue.current);
    expect(copy.advance(10)).toBe(queue.advance(10));
    expect(copy.upcoming).toEqual(queue.upcoming);

    const wider = new KeyQueue(new Rng(1), SPAWN, 2, { current: 3, upcoming: [2] });
    expect(wider.current).toBe(3);
    expect(wider.upcoming[0]).toBe(2);
    expect(wider.upcoming).toHaveLength(2);
    for (let i = 0; i < 100; i += 1) {
      expect(queue.advance(i * 5)).toBeLessThanOrEqual(5);
    }
  });
});

describe('слияния', () => {
  it('две одинаковые клавиши дают следующий тир, два Пробела — мега-клац', () => {
    expect(mergeResult(1, 11)).toEqual({ kind: 'form', tier: 2 });
    expect(mergeResult(10, 11)).toEqual({ kind: 'form', tier: 11 });
    expect(mergeResult(11, 11)).toEqual({ kind: 'mega' });
    expect(planMerges([{ a: 4, b: 2, tier: 3 }], 11)).toEqual([
      { a: 2, b: 4, tier: 3, result: { kind: 'form', tier: 4 } },
    ]);
  });

  it('одна клавиша не сливается дважды за шаг (защита от двойного слияния)', () => {
    // Клавиша 2 касается и 1, и 3 — все одного тира. Слияние одно: с клавишей 1 (она старше).
    const merges = planMerges(
      [
        { a: 2, b: 3, tier: 1 },
        { a: 1, b: 2, tier: 1 },
      ],
      11,
    );
    expect(merges).toHaveLength(1);
    expect(merges[0]).toMatchObject({ a: 1, b: 2 });
  });

  it('повторы пар и касание самой себя игнорируются, независимые пары сливаются все', () => {
    const merges = planMerges(
      [
        { a: 5, b: 6, tier: 2 },
        { a: 6, b: 5, tier: 2 },
        { a: 7, b: 7, tier: 2 },
        { a: 8, b: 9, tier: 4 },
      ],
      11,
    );
    expect(merges.map((merge) => [merge.a, merge.b])).toEqual([
      [5, 6],
      [8, 9],
    ]);
  });

  it('результат не зависит от порядка касаний', () => {
    const candidates = [
      { a: 3, b: 4, tier: 1 },
      { a: 2, b: 3, tier: 1 },
      { a: 4, b: 5, tier: 1 },
      { a: 1, b: 2, tier: 1 },
    ];
    const forward = planMerges(candidates, 11);
    const backward = planMerges([...candidates].reverse(), 11);
    expect(backward).toEqual(forward);
    expect(forward.map((merge) => [merge.a, merge.b])).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it('очки из баланса', () => {
    expect(mergeScore({ kind: 'form', tier: 2 })).toBe(SCORE.byTier[2]);
    expect(mergeScore({ kind: 'form', tier: 11 })).toBe(SCORE.byTier[11]);
    expect(mergeScore({ kind: 'mega' })).toBe(SCORE.mega);
  });
});

describe('линия опасности', () => {
  it('забег заканчивается, если клавиша выше линии дольше 2 с', () => {
    const tracker = new DangerTracker(2000);
    let state = tracker.update([{ id: 1, above: true }], 1000);
    expect(state).toEqual({ warning: true, overflow: false, longestMs: 1000 });
    state = tracker.update([{ id: 1, above: true }], 999);
    expect(state.overflow).toBe(false);
    state = tracker.update([{ id: 1, above: true }], 1);
    expect(state.overflow).toBe(true);
  });

  it('время сбрасывается, когда клавиша опустилась или исчезла', () => {
    const tracker = new DangerTracker(2000);
    tracker.update([{ id: 1, above: true }], 1500);
    let state = tracker.update([{ id: 1, above: false }], 16);
    expect(state).toEqual({ warning: false, overflow: false, longestMs: 0 });
    state = tracker.update([{ id: 1, above: true }], 1500);
    expect(state.overflow).toBe(false);
    // Клавиша слилась и пропала — её время забыто.
    state = tracker.update([], 16);
    expect(state.warning).toBe(false);
    state = tracker.update([{ id: 1, above: true }], 1000);
    expect(state.longestMs).toBe(1000);
  });

  it('время считается для каждой клавиши отдельно', () => {
    const tracker = new DangerTracker(2000);
    tracker.update([{ id: 1, above: true }], 1500);
    const state = tracker.update(
      [
        { id: 1, above: false },
        { id: 2, above: true },
      ],
      1000,
    );
    expect(state).toEqual({ warning: true, overflow: false, longestMs: 1000 });
  });
});

describe('комбо и перезарядка', () => {
  it('слияния быстрее секунды повышают тон на полутон', () => {
    const combo = new ComboCounter(1000, 3);
    expect(combo.hit(0)).toBe(0);
    expect(combo.hit(500)).toBe(1);
    expect(combo.hit(1400)).toBe(2);
    expect(combo.hit(1500)).toBe(3);
    expect(combo.hit(1600)).toBe(3);
    expect(combo.hit(3000)).toBe(0);
    expect(semitoneRatio(12)).toBeCloseTo(2);
    expect(semitoneRatio(0)).toBe(1);
  });

  it('тап-сквиш одной клавиши не чаще раза в 0,3 с', () => {
    const cooldown = new CooldownMap(300);
    expect(cooldown.tryUse(1, 0)).toBe(true);
    expect(cooldown.tryUse(1, 299)).toBe(false);
    expect(cooldown.tryUse(2, 100)).toBe(true);
    expect(cooldown.tryUse(1, 300)).toBe(true);
    cooldown.forget(1);
    expect(cooldown.tryUse(1, 301)).toBe(true);
  });
});

describe('снимок забега', () => {
  const limits = { maxTier: 11, maxKeys: 150 };
  const valid: RunSnapshot = {
    v: 1,
    world: 'classic',
    seed: 12345,
    rng: 4000000000,
    score: 420,
    elapsedMs: 65000,
    drops: 30,
    merges: 12,
    bestTier: 6,
    current: 2,
    upcoming: [1],
    aimX: 280.5,
    keys: [{ tier: 3, x: 100.25, y: 700, angle: 0.1, vx: 0, vy: -0.5, spin: 0 }],
  };

  it('правильный снимок читается как есть', () => {
    expect(readRunSnapshot(JSON.parse(JSON.stringify(valid)), limits)).toEqual(valid);
  });

  it('продолжить предлагается только целый забег известного мира, где уже был сброс', () => {
    const maxTierOf = (world: string) => (world === 'classic' ? 11 : null);
    expect(offerableSnapshot(valid, maxTierOf, 150)).toEqual(valid);
    expect(offerableSnapshot({ ...valid, world: 'space' }, maxTierOf, 150)).toBeNull();
    expect(offerableSnapshot({ ...valid, drops: 0 }, maxTierOf, 150)).toBeNull();
    expect(offerableSnapshot({ ...valid, current: 11 }, () => 5, 150)).toBeNull();
    expect(offerableSnapshot('мусор', maxTierOf, 150)).toBeNull();
  });

  it('битые данные дают null, игра не падает', () => {
    const broken: unknown[] = [
      null,
      'снимок',
      [],
      { ...valid, v: 2 },
      { ...valid, world: '' },
      { ...valid, seed: -1 },
      { ...valid, score: 1.5 },
      { ...valid, current: 12 },
      { ...valid, bestTier: 0 },
      { ...valid, upcoming: [1, 'x'] },
      { ...valid, aimX: Number.NaN },
      { ...valid, keys: {} },
      { ...valid, keys: [{ ...valid.keys[0], tier: 0 }] },
      { ...valid, keys: [{ ...valid.keys[0], x: Number.POSITIVE_INFINITY }] },
      { ...valid, keys: [{ ...valid.keys[0], vy: 5000 }] },
      { ...valid, keys: new Array(151).fill(valid.keys[0]) },
    ];
    broken.forEach((raw) => expect(readRunSnapshot(raw, limits)).toBeNull());
  });
});
