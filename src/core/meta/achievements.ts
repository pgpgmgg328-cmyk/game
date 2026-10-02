import { ACHIEVEMENTS } from '../../config/balance';
import type { DeepReadonly, Save } from '../save/schema';
import { hasRainbowJar } from './daily';

/** Сколько всего сделано за текущий забег (ещё не попало в статистику сохранения). */
export interface RunProgress {
  merges: number;
  goldenMerges: number;
  megas: number;
}

export const NO_RUN_PROGRESS: RunProgress = { merges: 0, goldenMerges: 0, megas: 0 };

/** Секретные достижения выдаются за пасхалки, а не вычисляются по сохранению. */
export type SecretAchievement = 'pianist' | 'secret_word';

export interface AchievementDef {
  id: string;
  reward: number;
  /** До получения скрыто: в альбоме видно «???». */
  secret: boolean;
  /** Для «Коллекционера мира»: id мира. */
  world?: string;
}

/** Мир для «Коллекционера»: id и число форм. */
export interface CollectorWorld {
  id: string;
  forms: number;
}

const WORLD1 = 'classic';

/**
 * Все достижения (диздок, раздел 6) плюс секретные за пасхалки. «Коллекционер мира» —
 * по одному на мир.
 */
export function achievementList(worlds: readonly CollectorWorld[]): AchievementDef[] {
  return [
    { id: 'first_clack', reward: ACHIEVEMENTS.first_clack, secret: false },
    { id: 'caps', reward: ACHIEVEMENTS.caps, secret: false },
    { id: 'spacebar', reward: ACHIEVEMENTS.spacebar, secret: false },
    { id: 'mega', reward: ACHIEVEMENTS.mega, secret: false },
    { id: 'golden_rush', reward: ACHIEVEMENTS.golden_rush, secret: false },
    ...worlds.map((world) => ({
      id: `collector_${world.id}`,
      reward: ACHIEVEMENTS.collector,
      secret: false,
      world: world.id,
    })),
    { id: 'week_streak', reward: ACHIEVEMENTS.week_streak, secret: false },
    { id: 'pianist', reward: ACHIEVEMENTS.pianist, secret: true },
    { id: 'secret_word', reward: ACHIEVEMENTS.secret_word, secret: true },
  ];
}

/**
 * Достижения, которые игрок уже заслужил по сохранению и текущему забегу.
 * Секретные сюда не входят — их выдаёт сама пасхалка.
 */
export function earnedAchievements(
  save: DeepReadonly<Save>,
  worlds: readonly CollectorWorld[],
  run: RunProgress = NO_RUN_PROGRESS,
): string[] {
  const { stats, album } = save;
  const earned: string[] = [];
  if (stats.merges + run.merges >= 1) earned.push('first_clack');
  // «Капсом!» — Капс мира 1 (тир 7), «Пробел!» — Пробел любого мира (тир 11).
  if (album[WORLD1]?.forms.includes(7)) earned.push('caps');
  if (Object.values(album).some((world) => world.forms.includes(11))) earned.push('spacebar');
  if (stats.megas + run.megas >= 1) earned.push('mega');
  if (stats.goldenMerges + run.goldenMerges >= ACHIEVEMENTS.goldenRushMerges) {
    earned.push('golden_rush');
  }
  for (const world of worlds) {
    const forms = album[world.id]?.forms ?? [];
    if (forms.filter((tier) => tier <= world.forms).length >= world.forms) {
      earned.push(`collector_${world.id}`);
    }
  }
  if (hasRainbowJar(save)) earned.push('week_streak');
  return earned;
}

/**
 * Выдаёт достижения, которых ещё нет (изменяет черновик): отмечает их и начисляет монеты.
 * Возвращает только новые.
 */
export function grantAchievements(
  draft: Save,
  ids: readonly string[],
  worlds: readonly CollectorWorld[],
): AchievementDef[] {
  const list = achievementList(worlds);
  const granted: AchievementDef[] = [];
  for (const id of ids) {
    if (draft.achievements.includes(id)) continue;
    const def = list.find((item) => item.id === id);
    if (!def) continue;
    draft.achievements.push(id);
    draft.coins += def.reward;
    granted.push(def);
  }
  return granted;
}
