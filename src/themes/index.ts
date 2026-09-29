import type { Lang } from '../i18n';
import type { FormData, KeyLabel, ThemeData } from './types';
import { WORLD1_CLASSIC } from './world1-classic';

export type * from './types';

/** Все миры игры по порядку открытия. Миры 2 и 3 добавятся в M4. */
export const THEMES: readonly ThemeData[] = [WORLD1_CLASSIC];

export const DEFAULT_THEME_ID = WORLD1_CLASSIC.id;

/** Миры для альбома и «Коллекционера мира»: id и число форм. */
export const WORLD_SIZES: readonly { id: string; forms: number }[] = THEMES.map((theme) => ({
  id: theme.id,
  forms: theme.forms.length,
}));

export function getTheme(id: string): ThemeData | null {
  return THEMES.find((theme) => theme.id === id) ?? null;
}

/** Номер самой большой формы мира (Пробела). */
export function maxTier(theme: ThemeData): number {
  return theme.forms.length;
}

export function formOf(theme: ThemeData, tier: number): FormData {
  const form = theme.forms[tier - 1];
  if (!form) throw new Error(`В мире ${theme.id} нет формы ${tier}`);
  return form;
}

/** Текст надписи на нужном языке; null — надпись рисуется значком. */
export function labelText(label: KeyLabel, lang: Lang): string | null {
  if (label.kind !== 'text') return null;
  return typeof label.text === 'string' ? label.text : label.text[lang];
}
