import { describe, expect, it } from 'vitest';
import en from '../src/i18n/en.json';
import { createTranslator, formatNumber, resolveLang } from '../src/i18n';
import ru from '../src/i18n/ru.json';

describe('словари', () => {
  it('в ru.json и en.json одинаковые ключи', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ru).sort());
  });

  it('нет пустых строк', () => {
    for (const [lang, dictionary] of Object.entries({ ru, en })) {
      for (const [key, value] of Object.entries(dictionary)) {
        expect(value.trim(), `${lang}: ${key}`).not.toBe('');
      }
    }
  });

  it('в каждом переводе те же параметры {…}, что и в русском тексте', () => {
    const params = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();
    for (const key of Object.keys(ru) as (keyof typeof ru)[]) {
      expect(params(en[key]), key).toEqual(params(ru[key]));
    }
  });

  it('название игры совпадает с названием в ТЗ', () => {
    expect(ru['game.title']).toBe('Сквиши Клавиши: Мерж до Пробела');
    expect(en['game.title']).toBe('Squishy Keys: Merge to Spacebar');
  });
});

describe('resolveLang', () => {
  it.each(['ru', 'be', 'kk', 'uk', 'uz'])('для %s показывает русский', (code) => {
    expect(resolveLang(code)).toBe('ru');
  });

  it.each(['en', 'tr', 'de', 'ar', 'zh', 'hy'])('для %s показывает английский', (code) => {
    expect(resolveLang(code)).toBe('en');
  });

  it('понимает регистр, регион и пробелы', () => {
    expect(resolveLang('RU')).toBe('ru');
    expect(resolveLang('ru-RU')).toBe('ru');
    expect(resolveLang(' uk ')).toBe('ru');
    expect(resolveLang('en-US')).toBe('en');
  });

  it('без языка выбирает английский', () => {
    expect(resolveLang('')).toBe('en');
    expect(resolveLang(null)).toBe('en');
    expect(resolveLang(undefined)).toBe('en');
  });
});

describe('createTranslator', () => {
  it('переводит по ключу', () => {
    expect(createTranslator('ru')('menu.play')).toBe('ИГРАТЬ');
    expect(createTranslator('en')('menu.play')).toBe('PLAY');
  });

  it('подставляет параметры', () => {
    const t = createTranslator('ru');
    expect(t('settings.sound', { state: t('common.off') })).toBe('Звук: выкл');
  });

  it('оставляет неизвестный параметр как есть', () => {
    expect(createTranslator('en')('settings.music', {})).toBe('Music: {state}');
  });
});

describe('formatNumber', () => {
  it('разделяет разряды по правилам языка', () => {
    expect(formatNumber(0, 'ru')).toBe('0');
    expect(formatNumber(999, 'en')).toBe('999');
    expect(formatNumber(1234, 'en')).toBe('1,234');
    expect(formatNumber(1234567, 'en')).toBe('1,234,567');
    expect(formatNumber(12345, 'ru')).toBe('12\u00a0345');
    expect(formatNumber(-5, 'ru')).toBe('0');
    expect(formatNumber(10.6, 'en')).toBe('11');
  });
});
