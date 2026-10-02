import { describe, expect, it } from 'vitest';
import { DAILY } from '../src/config/balance';
import {
  DAY_MS,
  canClaimGift,
  claimGift,
  completeTask,
  currentStreak,
  dayNumber,
  hasRainbowJar,
  makeTask,
  rollDay,
  taskReward,
} from '../src/core/meta/daily';
import { createDefaultSave, type Save } from '../src/core/save/schema';

const WORLDS = [
  { id: 'classic', forms: 11 },
  { id: 'candy', forms: 11 },
  { id: 'space', forms: 11 },
];

function save(change: (draft: Save) => void = () => {}): Save {
  const draft = createDefaultSave();
  change(draft);
  return draft;
}

/** Сделать задание и выполнить его в день day. */
function playDay(draft: Save, day: number): void {
  rollDay(draft, WORLDS, day);
  const task = draft.daily.task!;
  completeTask(draft, day, task.world, task.tier);
}

describe('день по серверному времени', () => {
  it('новый день начинается в полночь по часам игрока', () => {
    // 2026-10-02 23:30 по Москве (UTC+3) — это 20:30 UTC того же дня.
    const moscowLate = Date.UTC(2026, 9, 2, 20, 30);
    const moscowAfterMidnight = Date.UTC(2026, 9, 2, 21, 30);
    const day = dayNumber(moscowLate, -180);
    expect(dayNumber(moscowAfterMidnight, -180)).toBe(day + 1);
    // Для игрока в UTC это всё ещё один день.
    expect(dayNumber(moscowAfterMidnight, 0)).toBe(dayNumber(moscowLate, 0));
    expect(dayNumber(Date.UTC(2026, 9, 2), 0)).toBe(Date.UTC(2026, 9, 2) / DAY_MS);
  });

  it('невозможный часовой пояс не ломает счёт дней', () => {
    const now = Date.UTC(2026, 9, 2, 12);
    expect(dayNumber(now, Number.NaN)).toBe(dayNumber(now, 0));
    expect(dayNumber(now, 10_000)).toBe(dayNumber(now, 14 * 60));
  });
});

describe('«Клавиша дня»', () => {
  it('мир — только из открытых, форма — по силам, не меньше Стрелочки', () => {
    const fresh = save();
    for (let day = 100; day < 130; day += 1) {
      expect(makeTask(fresh, WORLDS, day)).toEqual({ world: 'classic', tier: DAILY.taskMinTier });
    }
  });

  it('опытному игроку — формы до Бэкспейса, не больше его лучшей формы', () => {
    const expert = save((d) => {
      for (const id of ['classic', 'candy', 'space']) {
        d.album[id] = { forms: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], golden: [] };
      }
    });
    const worlds = new Set<string>();
    const tiers = new Set<number>();
    for (let day = 0; day < 60; day += 1) {
      const task = makeTask(expert, WORLDS, day)!;
      worlds.add(task.world);
      tiers.add(task.tier);
    }
    expect([...worlds].sort()).toEqual(['candy', 'classic', 'space']);
    for (const tier of tiers) {
      expect(tier).toBeGreaterThanOrEqual(9);
      expect(tier).toBeLessThanOrEqual(DAILY.taskMaxTier);
    }
    const middle = save((d) => (d.album.classic = { forms: [1, 2, 3, 4, 5, 6, 7], golden: [] }));
    for (let day = 0; day < 30; day += 1) {
      const tier = makeTask(middle, WORLDS, day)!.tier;
      expect(tier).toBeGreaterThanOrEqual(5);
      expect(tier).toBeLessThanOrEqual(7);
    }
  });

  it('одно задание на весь день, назавтра новое; подарки снова доступны', () => {
    const draft = save();
    expect(rollDay(draft, WORLDS, 500)).toBe(true);
    const task = draft.daily.task;
    expect(task).not.toBeNull();
    draft.daily.gift = true;
    expect(rollDay(draft, WORLDS, 500)).toBe(false);
    expect(draft.daily.gift).toBe(true);
    // Часы ушли назад — ничего не выдаём заново.
    expect(rollDay(draft, WORLDS, 499)).toBe(false);
    expect(rollDay(draft, WORLDS, 501)).toBe(true);
    expect(draft.daily).toMatchObject({ day: 501, taskDone: false, gift: false, adGift: false });
  });

  it('испорченный день далеко в будущем не блокирует задания', () => {
    const draft = save((d) => (d.daily.day = 9000));
    expect(rollDay(draft, WORLDS, 600)).toBe(true);
    expect(draft.daily.day).toBe(600);
  });

  it('выполнение: награда один раз, только в мире задания и не меньше нужной формы', () => {
    const draft = save();
    rollDay(draft, WORLDS, 700);
    const task = draft.daily.task!;
    expect(completeTask(draft, 700, 'candy', 11)).toBeNull();
    expect(completeTask(draft, 700, task.world, task.tier - 1)).toBeNull();
    // Задание другого дня не засчитывается.
    expect(completeTask(draft, 701, task.world, task.tier)).toBeNull();
    const done = completeTask(draft, 700, task.world, task.tier + 1);
    expect(done).toEqual({ coins: taskReward(task), streak: 1, rainbow: false });
    expect(draft.coins).toBe(taskReward(task));
    expect(completeTask(draft, 700, task.world, task.tier)).toBeNull();
    expect(draft.coins).toBe(taskReward(task));
  });

  it('награда растёт с формой', () => {
    expect(taskReward({ world: 'classic', tier: 9 })).toBeGreaterThan(
      taskReward({ world: 'classic', tier: 5 }),
    );
  });
});

describe('серия дней', () => {
  it('семь дней подряд — банка «Радуга» один раз', () => {
    const draft = save();
    for (let day = 10; day < 16; day += 1) playDay(draft, day);
    expect(currentStreak(draft, 15)).toBe(6);
    expect(hasRainbowJar(draft)).toBe(false);
    rollDay(draft, WORLDS, 16);
    const task = draft.daily.task!;
    expect(completeTask(draft, 16, task.world, task.tier)).toMatchObject({
      streak: 7,
      rainbow: true,
    });
    expect(hasRainbowJar(draft)).toBe(true);
    playDay(draft, 17);
    expect(draft.daily.streak).toBe(8);
    expect(draft.daily.bestStreak).toBe(8);
  });

  it('пропущенный день — серия начинается заново, а лучшая остаётся', () => {
    const draft = save();
    for (let day = 10; day < 13; day += 1) playDay(draft, day);
    // Вчера сделано — серия жива и сегодня, пока задание ещё не выполнено.
    expect(currentStreak(draft, 13)).toBe(3);
    expect(currentStreak(draft, 14)).toBe(0);
    playDay(draft, 14);
    expect(draft.daily).toMatchObject({ streak: 1, bestStreak: 3, lastDone: 14 });
  });
});

describe('подарок дня', () => {
  it('бесплатный — раз в день, второй (за рекламу) — только после первого', () => {
    const draft = save();
    rollDay(draft, WORLDS, 900);
    expect(canClaimGift(draft, 900, 'ad')).toBe(false);
    expect(claimGift(draft, 900, 'ad', 150)).toBe(false);
    expect(claimGift(draft, 900, 'free', 150)).toBe(true);
    expect(claimGift(draft, 900, 'free', 150)).toBe(false);
    expect(canClaimGift(draft, 900, 'ad')).toBe(true);
    expect(claimGift(draft, 900, 'ad', 150)).toBe(true);
    expect(claimGift(draft, 900, 'ad', 150)).toBe(false);
    expect(draft.coins).toBe(300);
    // Не начатый день — подарков нет, пока не наступил rollDay.
    expect(canClaimGift(draft, 901, 'free')).toBe(false);
    rollDay(draft, WORLDS, 901);
    expect(canClaimGift(draft, 901, 'free')).toBe(true);
  });

  it('дробные и отрицательные суммы не ломают кошелёк', () => {
    const draft = save();
    rollDay(draft, WORLDS, 1);
    claimGift(draft, 1, 'free', -20);
    claimGift(draft, 1, 'ad', 10.9);
    expect(draft.coins).toBe(10);
  });
});
