import { WORLDS } from '../../config/balance';
import type { DeepReadonly, Save } from '../save/schema';

/** Мир для правил открытия: id и число форм (последняя — Пробел). Миры — по порядку открытия. */
export interface WorldInfo {
  id: string;
  forms: number;
}

/** Цена мира в монетах по его номеру (0 — первый мир, открыт всегда). */
export function unlockPrice(index: number): number {
  if (index <= 0) return 0;
  const prices = WORLDS.unlockPrices;
  const last = prices.length - 1;
  if (index <= last) return prices[index]!;
  return prices[last]! + WORLDS.laterPriceStep * (index - last);
}

/** В альбоме мира уже есть его Пробел (последняя форма). */
export function hasSpacebar(save: DeepReadonly<Save>, world: WorldInfo): boolean {
  return save.album[world.id]?.forms.includes(world.forms) ?? false;
}

/**
 * Мир открыт (диздок, раздел 5): первый — всегда, следующий — после Пробела в прошлом мире
 * или за монеты.
 */
export function isWorldUnlocked(
  save: DeepReadonly<Save>,
  worlds: readonly WorldInfo[],
  index: number,
): boolean {
  const world = worlds[index];
  if (!world) return false;
  if (index === 0 || save.worlds.bought.includes(world.id)) return true;
  return hasSpacebar(save, worlds[index - 1]!);
}

/** Номер мира в карусели меню: выбранный, а если такого мира нет — первый. */
export function selectedWorldIndex(save: DeepReadonly<Save>, worlds: readonly WorldInfo[]): number {
  const index = worlds.findIndex((world) => world.id === save.worlds.selected);
  return index >= 0 ? index : 0;
}

/** Хватает ли монет, чтобы открыть закрытый мир. */
export function canBuyWorld(
  save: DeepReadonly<Save>,
  worlds: readonly WorldInfo[],
  index: number,
): boolean {
  if (!worlds[index] || isWorldUnlocked(save, worlds, index)) return false;
  return save.coins >= unlockPrice(index);
}

/** Открыть мир за монеты (изменяет черновик): монеты списаны, мир выбран в карусели. */
export function buyWorld(draft: Save, worlds: readonly WorldInfo[], index: number): boolean {
  const world = worlds[index];
  if (!world || !canBuyWorld(draft, worlds, index)) return false;
  draft.coins -= unlockPrice(index);
  draft.worlds.bought.push(world.id);
  draft.worlds.selected = world.id;
  return true;
}

/**
 * Какой мир откроет новая форма: Пробел мира, которого ещё не было в альбоме, открывает
 * следующий мир, если тот ещё закрыт. Проверять до того, как форма попала в альбом.
 */
export function worldUnlockedBy(
  save: DeepReadonly<Save>,
  worlds: readonly WorldInfo[],
  worldId: string,
  tier: number,
): WorldInfo | null {
  const index = worlds.findIndex((world) => world.id === worldId);
  const world = worlds[index];
  const next = worlds[index + 1];
  if (!world || !next || tier !== world.forms) return null;
  return isWorldUnlocked(save, worlds, index + 1) ? null : next;
}
