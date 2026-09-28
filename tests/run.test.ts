import { describe, expect, it } from 'vitest';
import { DANGER, DROP, JAR, PHYSICS, SCORE, SQUISH } from '../src/config/balance';
import { Run, type RunEvent } from '../src/game/run/Run';
import { WORLD1_CLASSIC } from '../src/themes/world1-classic';
import { matter } from './matter';

const STEPS_PER_SECOND = Math.round(1000 / PHYSICS.stepMs);

function createRun(seed = 1): { run: Run; events: RunEvent[] } {
  const run = new Run(matter, WORLD1_CLASSIC, { seed });
  const events: RunEvent[] = [];
  run.on((event) => events.push(event));
  return { run, events };
}

function tiers(run: Run): number[] {
  return [...run.keys].map((key) => key.tier).sort((a, b) => a - b);
}

function ofType<T extends RunEvent['type']>(events: RunEvent[], type: T) {
  return events.filter((event): event is Extract<RunEvent, { type: T }> => event.type === type);
}

describe('забег на настоящей физике', () => {
  it('две одинаковые клавиши, сброшенные друг на друга, сливаются в следующую форму', () => {
    const { run, events } = createRun();
    run.setCurrentTier(1);
    run.setAim(300);
    expect(run.drop()).toBe(true);
    run.stepMany(Math.ceil(DROP.cooldownMs / PHYSICS.stepMs) + 1);
    run.setCurrentTier(1);
    expect(run.drop()).toBe(true);
    run.stepMany(3 * STEPS_PER_SECOND);

    expect(tiers(run)).toEqual([2]);
    const merges = ofType(events, 'merge');
    expect(merges).toHaveLength(1);
    expect(merges[0]!.result).toEqual({ kind: 'form', tier: 2 });
    expect(merges[0]!.score).toBe(SCORE.byTier[2]);
    expect(run.score).toBe(SCORE.byTier[2]);
    expect(run.getStats()).toMatchObject({ drops: 2, merges: 1, bestTier: 2 });
    expect(ofType(events, 'land').length).toBeGreaterThanOrEqual(1);
  });

  it('новая клавиша появляется посередине и подпрыгивает вверх', () => {
    const { run, events } = createRun();
    run.placeKey(3, 200, JAR.height - 40);
    run.placeKey(3, 272, JAR.height - 40);
    run.stepMany(1);
    const merge = ofType(events, 'merge')[0]!;
    expect(merge.x).toBeCloseTo(236, 0);
    expect(merge.created?.tier).toBe(4);
    expect(merge.created!.body.velocity.y).toBeLessThan(0);
  });

  it('три одинаковые клавиши в ряд: одна сливается дважды не может', () => {
    const { run, events } = createRun();
    // Три Точки внахлёст на 2 единицы: средняя касается обеих соседок в одном шаге.
    run.placeKey(1, 225, JAR.height - 25);
    run.placeKey(1, 273, JAR.height - 25);
    run.placeKey(1, 321, JAR.height - 25);
    run.stepMany(1);
    const firstStep = ofType(events, 'merge');
    expect(firstStep).toHaveLength(1);
    const [a, b] = firstStep[0]!.removed;
    expect([a.id, b.id]).toEqual([1, 2]);

    run.stepMany(3 * STEPS_PER_SECOND);
    // Из трёх Точек получается Запятулька и Точка, а не две Запятульки.
    expect(tiers(run)).toEqual([1, 2]);
    const removedIds = ofType(events, 'merge').flatMap((merge) => merge.removed.map((k) => k.id));
    expect(new Set(removedIds).size).toBe(removedIds.length);
  });

  it('два Пробела дают мега-клац: обе клавиши исчезают, очков много', () => {
    const { run, events } = createRun();
    run.placeKey(11, 150, JAR.height - 60);
    run.placeKey(11, 448, JAR.height - 60);
    run.stepMany(1);
    const merge = ofType(events, 'merge')[0]!;
    expect(merge.result).toEqual({ kind: 'mega' });
    expect(merge.created).toBeNull();
    expect(run.keyCount).toBe(0);
    expect(run.score).toBe(SCORE.mega);
  });

  it('клавиша выше линии дольше 2 с заканчивает забег, линия сначала мигает', () => {
    const { run, events } = createRun();
    // Столбик из чередующихся Стрелочек и Циферок выше линии опасности: слиться им не с кем.
    let y = JAR.height;
    for (let i = 0; i < 10; i += 1) {
      const tier = i % 2 === 0 ? 5 : 4;
      const { height } = run.sizeOf(tier);
      run.placeKey(tier, 300, y - height / 2 - 1);
      y -= height + 2;
    }
    expect(y).toBeLessThan(JAR.dangerDepth);
    run.stepMany(Math.round((DANGER.overflowMs / 1000) * STEPS_PER_SECOND) - 30);
    expect(run.dangerWarning).toBe(true);
    expect(run.over).toBe(false);
    expect(ofType(events, 'danger')[0]).toEqual({ type: 'danger', warning: true });

    run.stepMany(2 * STEPS_PER_SECOND);
    expect(run.over).toBe(true);
    expect(ofType(events, 'gameover')).toHaveLength(1);
    expect(run.canDrop).toBe(false);
    expect(run.drop()).toBe(false);
  });

  it('тап-сквиш подбрасывает клавишу, но не чаще раза в 0,3 с', () => {
    const { run, events } = createRun();
    const key = run.placeKey(3, 300, JAR.height - 40);
    run.stepMany(STEPS_PER_SECOND);
    const hit = run.keyAt(300, JAR.height - 36);
    expect(hit).toBe(key);
    expect(run.keyAt(300, 100)).toBeNull();
    // Рядом с клавишей, но в пределах допуска для пальца — тоже попадание.
    expect(
      run.keyAt(300 + key.width / 2 + SQUISH.touchSlop - 2, JAR.height - 36, SQUISH.touchSlop),
    ).toBe(key);

    expect(run.squish(key, 300)).toBe(true);
    expect(key.body.velocity.y).toBeLessThan(-1);
    expect(run.squish(key, 300)).toBe(false);
    run.stepMany(Math.ceil(SQUISH.cooldownMs / PHYSICS.stepMs) + 1);
    expect(run.squish(key, 300)).toBe(true);
    expect(ofType(events, 'squish')).toHaveLength(2);
  });

  it('прицел не выпускает висящую клавишу за стенки, сброс ждёт паузу', () => {
    const { run, events } = createRun();
    run.setCurrentTier(5);
    const half = run.sizeOf(5).width / 2;
    run.setAim(-100);
    expect(run.aimX).toBe(half);
    run.setAim(10_000);
    expect(run.aimX).toBe(JAR.width - half);

    expect(run.drop()).toBe(true);
    expect(run.canDrop).toBe(false);
    expect(run.drop()).toBe(false);
    run.stepMany(Math.ceil(DROP.cooldownMs / PHYSICS.stepMs) + 1);
    expect(run.canDrop).toBe(true);
    expect(ofType(events, 'ready')).toHaveLength(1);
  });

  it('клавиши не вылетают из банки', () => {
    const { run } = createRun(99);
    for (let i = 0; i < 40 && !run.over; i += 1) {
      run.setAim((i * 173) % JAR.width);
      run.drop();
      run.stepMany(Math.ceil(DROP.cooldownMs / PHYSICS.stepMs) + 20);
      for (const key of run.keys) {
        run.squish(key, key.body.position.x - 10);
      }
    }
    run.stepMany(2 * STEPS_PER_SECOND);
    for (const key of run.keys) {
      expect(key.body.bounds.min.x).toBeGreaterThan(-2);
      expect(key.body.bounds.max.x).toBeLessThan(JAR.width + 2);
      expect(key.body.bounds.max.y).toBeLessThan(JAR.height + 2);
    }
  });

  it('один seed и одинаковые действия — одинаковый забег', () => {
    const play = (): string => {
      const { run } = createRun(2024);
      for (let i = 0; i < 25; i += 1) {
        run.setAim(80 + ((i * 97) % 440));
        run.drop();
        run.update(DROP.cooldownMs + 100);
        run.stepMany(20);
      }
      return JSON.stringify(run.snapshot());
    };
    expect(play()).toBe(play());
  });

  it('снимок восстанавливает забег: клавиши, счёт, очередь', () => {
    const { run } = createRun(7);
    for (let i = 0; i < 20; i += 1) {
      run.setAim(100 + ((i * 131) % 400));
      run.drop();
      run.stepMany(40);
    }
    const snapshot = run.snapshot();
    const copy = new Run(matter, WORLD1_CLASSIC, { snapshot });
    expect(copy.snapshot()).toEqual(snapshot);
    expect(copy.keyCount).toBe(run.keyCount);
    expect(copy.currentTier).toBe(run.currentTier);
    expect(copy.upcoming).toEqual(run.upcoming);
    expect(copy.score).toBe(run.score);
    expect(copy.seed).toBe(7);

    // Очередь продолжается так же, как у исходного забега.
    run.stepMany(40);
    copy.stepMany(40);
    run.drop();
    copy.drop();
    expect(copy.currentTier).toBe(run.currentTier);
    expect(copy.upcoming).toEqual(run.upcoming);
  });
});
