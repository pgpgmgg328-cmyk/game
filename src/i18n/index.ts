import en from './en.json';
import ru from './ru.json';

export type Lang = 'ru' | 'en';
export type TranslationKey = keyof typeof ru;
export type TranslationParams = Readonly<Record<string, string | number>>;
export type Translate = (key: TranslationKey, params?: TranslationParams) => string;

// Тип проверяет, что в en.json есть все ключи из ru.json.
const DICTIONARIES: Readonly<Record<Lang, Readonly<Record<TranslationKey, string>>>> = { ru, en };

/**
 * Резервный набор языков Яндекс Игр: русский для ru, be, kk, uk, uz, для остальных — английский
 * (docs/yandex/concepts/languages-and-domains.md). Ручного выбора языка в v1 нет.
 */
const RUSSIAN_SPEAKING = ['ru', 'be', 'kk', 'uk', 'uz'];

/** Язык игры по коду языка платформы в формате ISO 639-1 (например, из ysdk.environment.i18n.lang). */
export function resolveLang(platformLang: string | null | undefined): Lang {
  const code = (platformLang ?? '').trim().toLowerCase().slice(0, 2);
  return RUSSIAN_SPEAKING.includes(code) ? 'ru' : 'en';
}

/** Возвращает функцию перевода. Параметры подставляются вместо {имя} в строке. */
export function createTranslator(lang: Lang): Translate {
  const dictionary = DICTIONARIES[lang];
  return (key, params) => {
    const template = dictionary[key];
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (placeholder: string, name: string) =>
      Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : placeholder,
    );
  };
}

/**
 * Число с разделителями разрядов: «12 345» по-русски и «12,345» по-английски.
 * Свой форматтер, а не toLocaleString: в разных браузерах он даёт разные пробелы.
 */
export function formatNumber(value: number, lang: Lang): string {
  const digits = String(Math.max(0, Math.round(value)));
  const separator = lang === 'ru' ? '\u00a0' : ',';
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}
