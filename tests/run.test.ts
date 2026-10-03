import { describe, expect, it } from 'vitest';
import {
  ADS,
  COINS,
  DANGER,
  DROP,
  JAR,
  PHYSICS,
  RUN,
  SCORE,
  SPAWN,
  SQUISH,
} from '../src/config/balance';
import { runModifiers, type RunModifiers } from '../src/core/meta/upgrades';
import { readRunSnapshot } from '../src/core/run/snapshot';
import { BASE_MODIFIERS, Run, type RunEvent, type RunOptions } from '../src/game/run/Run';
import { THEMES } from '../src/themes';
import { WORLD1_CLASSIC } from '../src/themes/world1-classic';
import { matter } from './matter';

const STEPS_PER_SECOND = Math.round(1000 / PHYSICS.stepMs);
const COOLDOWN_STEPS = Math.ceil(DROP.cooldownMs / PHYSICS.stepMs) + 1;

function createRun(
  seed = 1,
  options: Omit<RunOptions, 'seed'> = {},
): { run: Run; events: RunEvent[] } {
  const run = new Run(matter, WORLD1_CLASSIC, { seed, ...options });
  const events: RunEvent[] = [];
  run.on((event) => events.push(event));
  return { run, events };
}

function withModifiers(change: Partial<RunModifiers>): RunModifiers {
  return { ...BASE_MODIFIERS, ...change };
}

function tiers(run: Run): number[] {
  return [...run.keys].map((key) => key.tier).sort((a, b) => a - b);
}

function ofType<T extends RunEvent['type']>(events: RunEvent[], type: T) {
  return events.filter((event): event is Extract<RunEvent, { type: T }> => event.type === type);
}

describe('забег на настоящей физике', () => {
  it('веса спавна можно заменить (флаг spawnWeights)', () => {
    const { run } = createRun(7, { spawn: { ...SPAWN, weights: [0, 0, 0, 1, 0] } });
    const seen = new Set<number>([run.currentTier, ...run.upcoming.map((item) => item.tier)]);
    for (let i = 0; i < 20; i += 1) {
      run.setAim(i % 2 === 0 ? 120 : 480);
      run.drop();
      run.stepMany(COOLDOWN_STEPS);
      seen.add(run.currentTier);
    }
    expect([...seen]).toEqual([4]);
  });

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

  it.each(THEMES.map((theme) => [theme.id, theme] as const))(
    '%s: клавиша вплотную к стенке падает на дно, а не повисает над линией опасности',
    (_id, theme) => {
      for (const side of ['left', 'right'] as const) {
        const run = new Run(matter, theme, { seed: 3000 });
        const events: RunEvent[] = [];
        run.on((event) => events.push(event));
        run.setAim(side === 'left' ? -100 : 10_000);
        run.drop();
        const key = [...run.keys][0]!;
        // Касание стенки — ещё не «упала»: линия опасности её не считает.
        run.stepMany(Math.round(STEPS_PER_SECOND / 2));
        expect(key.settled).toBe(false);
        expect(run.dangerMs).toBe(0);
        // Стекло гладкое: за 3 с клавиша на дне, забег идёт.
        run.stepMany(3 * STEPS_PER_SECOND);
        expect(run.over).toBe(false);
        expect(key.body.bounds.max.y).toBeGreaterThan(JAR.height - 2);
        expect(ofType(events, 'land')).toHaveLength(1);
      }
    },
  );

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

describe('забег: золото, апгрейды и инструменты', () => {
  it('слияние с золотой клавишей: результат золотой, монеты ×3, счётчик золотых слияний', () => {
    const { run, events } = createRun();
    run.placeKey(3, 200, JAR.height - 40, true);
    run.placeKey(3, 272, JAR.height - 40);
    run.stepMany(1);
    const merge = ofType(events, 'merge')[0]!;
    expect(merge.golden).toBe(true);
    expect(merge.created?.golden).toBe(true);
    expect(merge.coins).toBe(4 * COINS.goldenMultiplier);
    expect(run.getStats()).toMatchObject({ merges: 1, goldenMerges: 1, coins: 12 });
  });

  it('обычное слияние даёт монеты по номеру тира, мега-клац — 100 и считается', () => {
    const { run, events } = createRun();
    run.placeKey(1, 150, JAR.height - 25);
    run.placeKey(1, 198, JAR.height - 25);
    run.placeKey(11, 150, JAR.height - 200);
    run.placeKey(11, 448, JAR.height - 200);
    run.stepMany(1);
    const merges = ofType(events, 'merge');
    expect(merges.map((merge) => merge.coins).sort((a, b) => a - b)).toEqual([2, COINS.mega]);
    expect(merges.every((merge) => !merge.golden && !merge.created?.golden)).toBe(true);
    expect(run.getStats()).toMatchObject({
      merges: 2,
      megas: 1,
      goldenMerges: 0,
      coins: 2 + COINS.mega,
    });
  });

  it('золотая висящая клавиша падает золотой', () => {
    const { run, events } = createRun();
    run.setCurrentTier(2, true);
    expect(run.current).toEqual({ tier: 2, golden: true });
    expect(run.drop()).toBe(true);
    expect(ofType(events, 'drop')[0]!.key.golden).toBe(true);
  });

  it('«Встряска» подбрасывает все клавиши и тратит заряды', () => {
    const { run, events } = createRun(3, { modifiers: withModifiers({ shakes: 2 }) });
    run.placeKey(3, 150, JAR.height - 40);
    run.placeKey(5, 400, JAR.height - 50);
    run.stepMany(STEPS_PER_SECOND);
    expect(run.charges).toEqual({ shakes: 2, removes: 0 });

    expect(run.shake()).toBe(true);
    for (const key of run.keys) expect(key.body.velocity.y).toBeLessThan(-1);
    expect(run.charges.shakes).toBe(1);
    expect(run.shake()).toBe(true);
    expect(run.shake()).toBe(false);
    expect(run.charges.shakes).toBe(0);
    expect(ofType(events, 'shake')).toHaveLength(2);

    // Без апгрейда зарядов нет.
    expect(createRun().run.shake()).toBe(false);
  });

  it('«Удаление» убирает клавишу из банки, пока есть заряды', () => {
    const { run, events } = createRun(3, { modifiers: withModifiers({ removes: 1 }) });
    const a = run.placeKey(2, 150, JAR.height - 30);
    const b = run.placeKey(4, 400, JAR.height - 45);
    expect(run.removeKey(a)).toBe(true);
    expect(a.removed).toBe(true);
    expect(run.keyCount).toBe(1);
    expect(run.keyAt(150, JAR.height - 30)).toBeNull();
    expect(run.removeKey(a)).toBe(false);
    expect(run.removeKey(b)).toBe(false);
    expect(run.keyCount).toBe(1);
    expect(run.charges.removes).toBe(0);
    expect(ofType(events, 'remove').map((event) => event.key)).toEqual([a]);
  });

  it('«Банка шире»: стенки и прицел по новой ширине', () => {
    const modifiers = runModifiers({
      shake: 0,
      remove: 0,
      preview: 0,
      squish: 0,
      golden: 0,
      jar: 3,
    });
    const { run } = createRun(5, { modifiers });
    expect(run.jar.width).toBe(Math.round(JAR.width * 1.06));
    run.setCurrentTier(5);
    run.setAim(10_000);
    expect(run.aimX).toBe(run.jar.width - run.sizeOf(5).width / 2);

    const key = run.placeKey(1, run.jar.width - 30, JAR.height - 25);
    run.stepMany(STEPS_PER_SECOND);
    // Клавиша лежит в добавленной полосе и не проходит сквозь правую стенку.
    expect(key.body.bounds.max.x).toBeGreaterThan(JAR.width);
    expect(key.body.bounds.max.x).toBeLessThan(run.jar.width + 2);
  });

  it('«+1 к силе сквиша» подбрасывает клавишу сильнее', () => {
    const lift = (squishPower: number): number => {
      const { run } = createRun(1, { modifiers: withModifiers({ squishPower }) });
      const key = run.placeKey(3, 300, JAR.height - 40);
      run.stepMany(STEPS_PER_SECOND);
      expect(run.squish(key, 300)).toBe(true);
      return -key.body.velocity.y;
    };
    expect(lift(1.6) / lift(1)).toBeCloseTo(1.6, 1);
  });

  it('второе «Далее»: видно две следующие клавиши', () => {
    const { run } = createRun(4, { modifiers: withModifiers({ preview: 2 }) });
    expect(run.upcoming).toHaveLength(2);
    const [first, second] = run.upcoming.map((item) => ({ ...item }));
    expect(run.drop()).toBe(true);
    expect(run.current).toEqual(first);
    expect(run.upcoming[0]).toEqual(second);
    expect(run.upcoming).toHaveLength(2);
  });

  it('обучение: первые клавиши идут по сценарию и не бывают золотыми', () => {
    const { run } = createRun(11, {
      opening: [1, 1, 2],
      modifiers: withModifiers({ goldenChance: 1 }),
    });
    expect(run.current).toEqual({ tier: 1, golden: false });
    expect(run.upcoming).toEqual([{ tier: 1, golden: false }]);
    run.drop();
    run.stepMany(COOLDOWN_STEPS);
    expect(run.current).toEqual({ tier: 1, golden: false });
    expect(run.upcoming).toEqual([{ tier: 2, golden: false }]);
    run.drop();
    run.stepMany(COOLDOWN_STEPS);
    expect(run.current).toEqual({ tier: 2, golden: false });
    // Дальше обычная очередь: при шансе 1 все клавиши золотые.
    expect(run.upcoming[0]!.golden).toBe(true);
  });

  it('снимок хранит золото, заряды и условия апгрейдов; снимок важнее текущих апгрейдов', () => {
    const modifiers = runModifiers({
      shake: 2,
      remove: 3,
      preview: 1,
      squish: 2,
      golden: 5,
      jar: 2,
    });
    const { run } = createRun(21, { modifiers });
    run.placeKey(4, 120, JAR.height - 45, true);
    run.placeKey(2, 400, JAR.height - 30);
    const victim = run.placeKey(1, 300, JAR.height - 25);
    run.stepMany(30);
    expect(run.shake()).toBe(true);
    expect(run.removeKey(victim)).toBe(true);
    run.stepMany(30);

    const snapshot = run.snapshot();
    expect(snapshot.modifiers).toEqual({
      jarWidth: modifiers.jarWidth,
      preview: 2,
      squishPower: modifiers.squishPower,
      goldenChance: modifiers.goldenChance,
    });
    expect([snapshot.shakes, snapshot.removes]).toEqual([1, 2]);
    expect(snapshot.keys.map((key) => key.golden)).toEqual([true, false]);
    expect(snapshot.upcoming).toHaveLength(2);

    // Снимок проходит проверку при чтении из хранилища.
    const stored: unknown = JSON.parse(JSON.stringify(snapshot));
    expect(readRunSnapshot(stored, { maxTier: 11, maxKeys: RUN.maxSnapshotKeys })).toEqual(
      snapshot,
    );

    const copy = new Run(matter, WORLD1_CLASSIC, { snapshot, modifiers: BASE_MODIFIERS });
    expect(copy.snapshot()).toEqual(snapshot);
    expect(copy.jar.width).toBe(modifiers.jarWidth);
    expect(copy.charges).toEqual({ shakes: 1, removes: 2 });
    expect([...copy.keys].map((key) => key.golden)).toEqual([true, false]);
  });
});

/** Столбик из чередующихся Стрелочек и Циферок выше линии опасности, забег доигран до переполнения. */
function overflowRun(options: Omit<RunOptions, 'seed'> = {}) {
  const created = createRun(3, options);
  const { run } = created;
  let y = JAR.height;
  for (let i = 0; i < 10; i += 1) {
    const tier = i % 2 === 0 ? 5 : 4;
    const { height } = run.sizeOf(tier);
    run.placeKey(tier, 300, y - height / 2 - 1);
    y -= height + 2;
  }
  run.stepMany(Math.round((DANGER.overflowMs / 1000) * STEPS_PER_SECOND) + 2 * STEPS_PER_SECOND);
  return created;
}

describe('бонусы за рекламу', () => {
  it('«Второй шанс»: только после переполнения, убирает три верхние клавиши, забег идёт дальше', () => {
    const fresh = createRun();
    expect(fresh.run.canRevive).toBe(false);
    expect(fresh.run.revive(ADS.secondChanceKeys)).toBe(false);

    const { run, events } = overflowRun();
    expect(run.over).toBe(true);
    expect(run.canRevive).toBe(true);
    const highest = [...run.keys]
      .sort((a, b) => a.body.bounds.min.y - b.body.bounds.min.y)
      .slice(0, ADS.secondChanceKeys)
      .map((key) => key.id);
    const before = run.keyCount;
    expect(run.revive(ADS.secondChanceKeys)).toBe(true);
    expect(run.over).toBe(false);
    expect(run.keyCount).toBe(before - ADS.secondChanceKeys);
    const revive = ofType(events, 'revive')[0]!;
    expect(revive.removed.map((key) => key.id).sort()).toEqual(highest.sort());
    expect(run.dangerWarning).toBe(false);
    expect(ofType(events, 'danger').at(-1)).toEqual({ type: 'danger', warning: false });
    expect(run.bonuses.revive).toBe(true);

    // Банка снова в порядке: можно бросать, а забег не кончается сам собой.
    run.stepMany(3 * STEPS_PER_SECOND);
    expect(run.over).toBe(false);
    expect(run.canDrop).toBe(true);
  });

  it('«Второй шанс» — один раз за забег, и после перезагрузки тоже', () => {
    const { run } = overflowRun();
    run.revive(ADS.secondChanceKeys);
    const restored = new Run(matter, WORLD1_CLASSIC, { snapshot: run.snapshot() });
    expect(restored.bonuses).toEqual({ revive: true, shake: false, remove: false });
    // Снова переполняем банку вторым столбиком: второго шанса нет.
    let y = JAR.height;
    for (let i = 0; i < 10; i += 1) {
      const tier = i % 2 === 0 ? 5 : 4;
      const { height } = restored.sizeOf(tier);
      restored.placeKey(tier, 110, y - height / 2 - 1);
      y -= height + 2;
    }
    restored.stepMany(4 * STEPS_PER_SECOND);
    expect(restored.over).toBe(true);
    expect(restored.canRevive).toBe(false);
    expect(restored.revive(ADS.secondChanceKeys)).toBe(false);
  });

  it('«+1 Встряска» и «+1 Удаление» за рекламу — когда заряды кончились, раз за забег', () => {
    const { run, events } = createRun(1, { modifiers: withModifiers({ shakes: 1, removes: 0 }) });
    expect(run.canAddCharge('shake')).toBe(false);
    expect(run.canAddCharge('remove')).toBe(true);
    expect(run.addCharge('remove')).toBe(true);
    expect(run.charges).toEqual({ shakes: 1, removes: 1 });
    expect(run.addCharge('remove')).toBe(false);
    run.shake();
    expect(run.canAddCharge('shake')).toBe(true);
    expect(run.addCharge('shake')).toBe(true);
    expect(run.charges).toEqual({ shakes: 1, removes: 1 });
    run.shake();
    expect(run.canAddCharge('shake')).toBe(false);
    expect(ofType(events, 'charge').map((event) => event.tool)).toEqual(['remove', 'shake']);
    expect(run.snapshot().adBonuses).toEqual({ revive: false, shake: true, remove: true });
  });
});
