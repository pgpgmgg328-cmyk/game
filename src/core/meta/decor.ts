import type { DeepReadonly, Save } from '../save/schema';
import { hasRainbowJar } from './daily';

/** Украшение: банка или фон. Как выглядит — в themes/decor.ts, здесь только правила. */
export type DecorKind = 'jar' | 'background';

/** Откуда украшение: есть у всех, из «Набора украшений» или за семь дней заданий подряд. */
export type DecorSource = 'default' | 'pack' | 'streak';

export interface DecorItem {
  id: string;
  kind: DecorKind;
  source: DecorSource;
}

export function ownsDecor(save: DeepReadonly<Save>, item: DecorItem): boolean {
  switch (item.source) {
    case 'default':
      return true;
    case 'pack':
      return save.purchases.skinsPack;
    case 'streak':
      return hasRainbowJar(save);
  }
}

/** Выбрать украшение (изменяет черновик). false — его у игрока нет. */
export function selectDecor(draft: Save, item: DecorItem): boolean {
  if (!ownsDecor(draft, item)) return false;
  if (item.kind === 'jar') draft.decor.jar = item.id;
  else draft.decor.background = item.id;
  return true;
}

/**
 * Украшение, которое сейчас видно: выбранное, если оно есть у игрока, иначе обычное
 * (первое из списка с source 'default').
 */
export function activeDecor<T extends DecorItem>(save: DeepReadonly<Save>, items: readonly T[]): T {
  const kind = items[0]?.kind ?? 'jar';
  const selected = kind === 'jar' ? save.decor.jar : save.decor.background;
  const chosen = items.find((item) => item.id === selected);
  if (chosen && ownsDecor(save, chosen)) return chosen;
  const fallback = items.find((item) => item.source === 'default') ?? items[0];
  if (!fallback) throw new Error('Нет украшений');
  return fallback;
}
