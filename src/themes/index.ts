import type { Lang } from '../i18n';
import type { FormData, KeyFinish, KeyLabel, ThemeData } from './types';
import { WORLD1_CLASSIC } from './world1-classic';
import { WORLD2_CANDY } from './world2-candy';
import { WORLD3_SPACE } from './world3-space';

export type * from './types';

/**
 * Все миры игры по порядку открытия (диздок, раздел 5). Новый мир — новый файл данных и строка
 * здесь: открытие, альбом, достижения и задания дня подхватят его сами.
 */
export const THEMES: readonly ThemeData[] = [WORLD1_CLASSIC, WORLD2_CANDY, WORLD3_SPACE];

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

/** Отделка клавиши: своя у формы или общая для мира. */
export function finishOf(theme: ThemeData, form: FormData): KeyFinish {
  return form.finish ?? theme.finish;
}

/** Текст надписи на нужном языке; null — надпись рисуется значком. */
export function labelText(label: KeyLabel, lang: Lang): string | null {
  if (label.kind !== 'text') return null;
  return typeof label.text === 'string' ? label.text : label.text[lang];
}
