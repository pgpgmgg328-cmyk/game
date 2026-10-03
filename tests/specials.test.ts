import { describe, expect, it } from 'vitest';
import { DANGER, DROP, JAR, PHYSICS } from '../src/config/balance';
import { readRunSnapshot } from '../src/core/run/snapshot';
import { Run, type RunEvent } from '../src/game/run/Run';
import { WORLD1_CLASSIC } from '../src/themes/world1-classic';
import { WORLD2_CANDY } from '../src/themes/world2-candy';
import { WORLD3_SPACE } from '../src/themes/world3-space';
import type { ThemeData } from '../src/themes';
import { matter } from './matter';

const STEPS_PER_SECOND = Math.round(1000 / PHYSICS.stepMs);
const COOLDOWN_STEPS = Math.ceil(DROP.cooldownMs / PHYSICS.stepMs) + 1;
const HOLD_MS = WORLD2_CANDY.specials.caramel!.holdMs;

function createRun(theme: ThemeData, seed = 1): { run: Run; events: RunEvent[] } {
  const run = new Run(matter, theme, { seed });
  const events: RunEvent[] = [];
  run.on((event) => events.push(event));
  return { run, events };
}

function ofType<T extends RunEvent['type']>(events: RunEvent[], type: T) {
  return events.filter((event): event is Extract<RunEvent, { type: T }> => event.type === type);
}

/** Шагать, пока не случится событие type (не дольше limitSteps). */
function stepUntil(run: Run, events: RunEvent[], type: RunEvent['type'], limitSteps = 600): number {
  for (let step = 0; step < limitSteps; step += 1) {
    if (events.some((event) => event.type === type)) return step;
    run.stepMany(1);
  }
  throw new Error(`Нет события ${type}`);
}

describe('«Карамелька» (мир 2)', () => {
  it('у стенки держится 3 с неподвижно, потом отлипает и падает', () => {
    const { run, events } = createRun(WORLD2_CANDY);
    run.setCurrentSpecial('caramel', 3);
    run.setAim(0);
    expect(run.drop()).toBe(true);
    stepUntil(run, events, 'stick');
    const key = ofType(events, 'stick')[0]!.key;
    expect(key.caramel).toBe('stuck');
    const stuckY = key.body.position.y;
    run.stepMany(Math.floor(((HOLD_MS - 300) / 1000) * STEPS_PER_SECOND));
    expect(key.body.position.y).toBeCloseTo(stuckY, 5);
    expect(ofType(events, 'unstick')).toHaveLength(0);
    run.stepMany(Math.ceil((500 / 1000) * STEPS_PER_SECOND));
    expect(ofType(events, 'unstick')).toHaveLength(1);
    expect(key.caramel).toBe('spent');
    run.stepMany(STEPS_PER_SECOND);
    expect(key.body.position.y).toBeGreaterThan(stuckY + 100);
  });

  it('вдали от стенок ведёт себя как обычная клавиша и сливается', () => {
    const { run, events } = createRun(WORLD2_CANDY);
    run.setCurrentSpecial('caramel', 1);
    run.setAim(300);
    run.drop();
    run.stepMany(COOLDOWN_STEPS);
    run.setCurrentTier(1);
    run.drop();
    run.stepMany(3 * STEPS_PER_SECOND);
    expect(ofType(events, 'stick')).toHaveLength(0);
    expect(ofType(events, 'merge')).toHaveLength(1);
    // Слияние с «Карамелькой» даёт обычную клавишу.
    expect([...run.keys].map((key) => key.caramel)).toEqual(['none']);
  });

  it('прилипает только ниже линии опасности, и прилипшая забег не заканчивает', () => {
    const { run, events } = createRun(WORLD2_CANDY);
    run.setCurrentSpecial('caramel', 5);
    run.setAim(0);
    run.drop();
    stepUntil(run, events, 'stick');
    const key = ofType(events, 'stick')[0]!.key;
    expect(key.body.bounds.min.y).toBeGreaterThanOrEqual(run.jar.dangerY);
    run.stepMany(Math.floor(((DANGER.overflowMs + 500) / 1000) * STEPS_PER_SECOND));
    expect(run.over).toBe(false);
    expect(run.dangerWarning).toBe(false);
  });

  it('шанс из данных мира: при шансе 1 все клавиши в карамели, в мире 1 — ни одной', () => {
    const sticky = { ...WORLD2_CANDY, specials: { caramel: { chance: 1, holdMs: 3000 } } };
    const { run } = createRun(sticky);
    expect([run.current, ...run.upcoming].every((item) => item.caramel)).toBe(true);
    const classic = createRun(WORLD1_CLASSIC).run;
    expect([classic.current, ...classic.upcoming].some((item) => item.caramel)).toBe(false);
  });
});

describe('«Метеорчик» (мир 3)', () => {
  it('попадает в клавишу: она исчезает вместе с ним, очки и слияния не меняются', () => {
    const { run, events } = createRun(WORLD3_SPACE);
    const target = run.placeKey(5, 300, JAR.height - 60);
    run.stepMany(STEPS_PER_SECOND);
    run.setCurrentSpecial('meteor');
    run.setAim(300);
    expect(run.drop()).toBe(true);
    expect(ofType(events, 'meteorDrop')).toHaveLength(1);
    expect(run.meteorInFlight).not.toBeNull();
    stepUntil(run, events, 'meteorHit', 10 * STEPS_PER_SECOND);
    expect(ofType(events, 'meteorHit')[0]!.key).toBe(target);
    expect(target.removed).toBe(true);
    expect(run.keyCount).toBe(0);
    expect(run.meteorInFlight).toBeNull();
    expect(run.score).toBe(0);
    expect(ofType(events, 'merge')).toHaveLength(0);
  });

  it('в пустой банке долетает до дна и рассыпается', () => {
    const { run, events } = createRun(WORLD3_SPACE);
    run.setCurrentSpecial('meteor');
    run.drop();
    stepUntil(run, events, 'meteorGone', 10 * STEPS_PER_SECOND);
    expect(run.meteorInFlight).toBeNull();
    expect(ofType(events, 'meteorHit')).toHaveLength(0);
  });

  it('встаёт в очередь раз в 45 с игры вместо клавиши', () => {
    const { run } = createRun(WORLD3_SPACE, 3);
    const seenAt: number[] = [];
    const seen = new Set<object>();
    while (run.elapsedMs < 100_000 && !run.over) {
      for (const item of [run.current, ...run.upcoming]) {
        if (item.meteor && !seen.has(item)) {
          seen.add(item);
          seenAt.push(run.elapsedMs);
        }
      }
      if (run.canDrop) {
        run.setAim(60 + ((run.getStats().drops * 97) % 480));
        run.drop();
      }
      run.stepMany(COOLDOWN_STEPS * 2);
    }
    expect(seenAt.length).toBeGreaterThanOrEqual(2);
    expect(seenAt[0]!).toBeGreaterThanOrEqual(45_000);
    for (let i = 1; i < seenAt.length; i += 1) {
      expect(seenAt[i]! - seenAt[i - 1]!).toBeGreaterThanOrEqual(45_000);
    }
  });
});

describe('снимок забега с особыми клавишами', () => {
  it('прилипшая «Карамелька» и «Метеорчик» в полёте переживают перезагрузку', () => {
    const { run, events } = createRun(WORLD2_CANDY);
    run.setCurrentSpecial('caramel', 4);
    run.setAim(0);
    run.drop();
    stepUntil(run, events, 'stick');
    run.stepMany(STEPS_PER_SECOND);
    const saved = readRunSnapshot(JSON.parse(JSON.stringify(run.snapshot())), {
      maxTier: 11,
      maxKeys: 200,
    });
    expect(saved).not.toBeNull();
    expect(saved!.keys[0]).toMatchObject({ caramel: 'stuck' });
    const left = saved!.keys[0]!.stuckMs!;
    expect(left).toBeGreaterThan(HOLD_MS - 1500);
    expect(left).toBeLessThan(HOLD_MS - 500);

    const restored = new Run(matter, WORLD2_CANDY, { snapshot: saved! });
    const restoredEvents: RunEvent[] = [];
    restored.on((event) => restoredEvents.push(event));
    const key = [...restored.keys][0]!;
    expect(key.caramel).toBe('stuck');
    const y = key.body.position.y;
    restored.stepMany(Math.floor(((left - 200) / 1000) * STEPS_PER_SECOND));
    expect(key.body.position.y).toBeCloseTo(y, 5);
    restored.stepMany(Math.ceil((400 / 1000) * STEPS_PER_SECOND));
    expect(ofType(restoredEvents, 'unstick')).toHaveLength(1);

    const space = createRun(WORLD3_SPACE);
    space.run.setCurrentSpecial('meteor');
    space.run.drop();
    space.run.stepMany(5);
    const flying = space.run.snapshot();
    expect(flying.meteor).not.toBeNull();
    const again = new Run(matter, WORLD3_SPACE, { snapshot: flying });
    expect(again.meteorInFlight?.body.position.y).toBeCloseTo(flying.meteor!.y, 1);
  });

  it('пробный забег помнит, что он пробный', () => {
    const run = new Run(matter, WORLD2_CANDY, { seed: 1, trial: true });
    expect(run.trial).toBe(true);
    run.drop();
    const restored = new Run(matter, WORLD2_CANDY, { snapshot: run.snapshot() });
    expect(restored.trial).toBe(true);
    expect(new Run(matter, WORLD2_CANDY, { seed: 1 }).trial).toBe(false);
  });
});

describe('физика миров', () => {
  it('в космосе клавиши падают медленнее, в сладком мире прыгают выше', () => {
    const fallTime = (theme: ThemeData): number => {
      const { run, events } = createRun(theme);
      run.setCurrentTier(3);
      run.setAim(300);
      run.drop();
      return stepUntil(run, events, 'land');
    };
    expect(fallTime(WORLD3_SPACE)).toBeGreaterThan(fallTime(WORLD1_CLASSIC) * 1.15);

    const bounce = (theme: ThemeData): number => {
      const { run, events } = createRun(theme);
      run.setCurrentTier(3);
      run.setAim(300);
      run.drop();
      stepUntil(run, events, 'land');
      let lowest = Number.POSITIVE_INFINITY;
      for (let i = 0; i < 30; i += 1) {
        run.stepMany(1);
        lowest = Math.min(lowest, [...run.keys][0]!.body.velocity.y);
      }
      // Самая большая скорость вверх после удара о дно.
      return -lowest;
    };
    expect(bounce(WORLD2_CANDY)).toBeGreaterThan(bounce(WORLD1_CLASSIC));
  });
});
