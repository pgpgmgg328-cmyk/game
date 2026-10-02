import { DAILY } from '../../config/balance';
import type { DailyTask, DeepReadonly, Save } from '../save/schema';
import { isWorldUnlocked, type WorldInfo } from './worlds';

export const DAY_MS = 86_400_000;
/** Часовые пояса Земли — от −12 до +14 часов; больший сдвиг считаем ошибкой устройства. */
const MAX_TZ_MINUTES = 14 * 60;

/**
 * Номер дня по календарю игрока (диздок, раздел 6): серверное время (его не подкрутить часами
 * устройства) со сдвигом часового пояса устройства — новый день начинается в полночь игрока.
 * tzOffsetMinutes — как у Date#getTimezoneOffset(): для Москвы −180.
 */
export function dayNumber(serverMs: number, tzOffsetMinutes: number): number {
  const offset = Number.isFinite(tzOffsetMinutes)
    ? Math.max(-MAX_TZ_MINUTES, Math.min(MAX_TZ_MINUTES, tzOffsetMinutes))
    : 0;
  return Math.floor((serverMs - offset * 60_000) / DAY_MS);
}

/** «Случайное» число дня: у всех игроков в этот день одно и то же, а назавтра другое. */
function dayHash(day: number, salt: number): number {
  let h = Math.imul(day ^ 0x5bd1e995, 0x9e3779b1) ^ Math.imul(salt, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return (h ^ (h >>> 15)) >>> 0;
}

/** Самая большая открытая форма мира; 0 — в этом мире ещё ничего. */
function bestForm(save: DeepReadonly<Save>, world: string): number {
  return Math.max(0, ...(save.album[world]?.forms ?? []));
}

/**
 * «Клавиша дня» (диздок, раздел 6): мир — из открытых, форма — по силам игроку (не больше его
 * лучшей формы в этом мире, но не меньше Стрелочки). null — открытых миров нет.
 */
export function makeTask(
  save: DeepReadonly<Save>,
  worlds: readonly WorldInfo[],
  day: number,
): DailyTask | null {
  const open = worlds.filter((_, index) => isWorldUnlocked(save, worlds, index));
  const world = open[dayHash(day, 1) % Math.max(1, open.length)];
  if (!world) return null;
  const easier = dayHash(day, 2) % 3;
  const highest = Math.min(DAILY.taskMaxTier, world.forms - 1);
  const tier = Math.max(DAILY.taskMinTier, Math.min(highest, bestForm(save, world.id) - easier));
  return { world: world.id, tier };
}

/**
 * Начать новый день (изменяет черновик): новое задание, подарки снова можно забрать.
 * false — день тот же (или часы показывают вчера: тогда ничего не выдаём заново).
 * Если сохранённый день дальше завтрашнего, сохранение испорчено — день начинается заново.
 */
export function rollDay(draft: Save, worlds: readonly WorldInfo[], day: number): boolean {
  const saved = draft.daily.day;
  if (day <= saved && saved <= day + 2) return false;
  draft.daily.day = day;
  draft.daily.task = makeTask(draft, worlds, day);
  draft.daily.taskDone = false;
  draft.daily.gift = false;
  draft.daily.adGift = false;
  return true;
}

/** Награда за «Клавишу дня»: чем больше форма, тем больше монет. */
export function taskReward(task: DailyTask): number {
  return DAILY.taskCoinsBase + DAILY.taskCoinsPerTier * task.tier;
}

/** Серия на сегодня: задание выполнено сегодня или вчера — серия жива, иначе её нет. */
export function currentStreak(save: DeepReadonly<Save>, day: number): number {
  const { lastDone, streak } = save.daily;
  return lastDone === day || lastDone === day - 1 ? streak : 0;
}

export interface TaskCompletion {
  coins: number;
  /** Серия дней вместе с сегодняшним. */
  streak: number;
  /** Серия впервые дошла до семи дней: банка «Радуга» теперь у игрока. */
  rainbow: boolean;
}

/**
 * Слияние вырастило форму tier в мире world (изменяет черновик). Если это «Клавиша дня» —
 * награда и серия дней; null — задание не про это или уже выполнено.
 */
export function completeTask(
  draft: Save,
  day: number,
  world: string,
  tier: number,
): TaskCompletion | null {
  const { daily } = draft;
  const task = daily.task;
  if (daily.day !== day || daily.taskDone || !task) return null;
  if (task.world !== world || tier < task.tier) return null;
  daily.taskDone = true;
  const coins = taskReward(task);
  draft.coins += coins;
  daily.streak = daily.lastDone === day - 1 ? daily.streak + 1 : 1;
  daily.lastDone = day;
  const before = daily.bestStreak;
  daily.bestStreak = Math.max(before, daily.streak);
  return {
    coins,
    streak: daily.streak,
    rainbow: before < DAILY.streakGoal && daily.bestStreak >= DAILY.streakGoal,
  };
}

/** Подарок дня: бесплатный — раз в день; второй, за рекламу, — после первого. */
export type GiftKind = 'free' | 'ad';

export function canClaimGift(save: DeepReadonly<Save>, day: number, kind: GiftKind): boolean {
  const { daily } = save;
  if (daily.day !== day) return false;
  return kind === 'free' ? !daily.gift : daily.gift && !daily.adGift;
}

/** Забрать подарок (изменяет черновик): монеты начислены. false — сегодня его уже забрали. */
export function claimGift(draft: Save, day: number, kind: GiftKind, coins: number): boolean {
  if (!canClaimGift(draft, day, kind)) return false;
  if (kind === 'free') draft.daily.gift = true;
  else draft.daily.adGift = true;
  draft.coins += Math.max(0, Math.floor(coins));
  return true;
}

/** Банка «Радуга»: семь дней «Клавиши дня» подряд хотя бы раз. */
export function hasRainbowJar(save: DeepReadonly<Save>): boolean {
  return save.daily.bestStreak >= DAILY.streakGoal;
}
