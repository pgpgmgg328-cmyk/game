import { describe, expect, it } from 'vitest';
import { MelodyTracker, SecretWordTracker } from '../src/core/menu/easterEggs';

describe('пасхалка «Пианист»', () => {
  it('мелодия — все буквы первого ряда слева направо', () => {
    const melody = new MelodyTracker(6);
    expect([0, 1, 2, 3, 4].map((i) => melody.press(i))).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(melody.press(5)).toBe(true);
    // После мелодии счёт начинается заново.
    expect(melody.press(5)).toBe(false);
  });

  it('ошибка сбрасывает мелодию, первая буква сразу начинает её снова', () => {
    const melody = new MelodyTracker(3);
    melody.press(0);
    melody.press(2);
    expect(melody.press(1)).toBe(false);
    melody.press(0);
    melody.press(0);
    melody.press(1);
    expect(melody.press(2)).toBe(true);
  });

  it('буква другого ряда прерывает мелодию', () => {
    const melody = new MelodyTracker(2);
    melody.press(0);
    melody.reset();
    expect(melody.press(1)).toBe(false);
  });
});

describe('пасхалка «Тайное слово»', () => {
  it('«КЛАЦ» на русской раскладке и «CLACK» на английской', () => {
    const tracker = new SecretWordTracker();
    expect(['KeyR', 'KeyK', 'KeyF'].map((code) => tracker.press(code))).toEqual([
      false,
      false,
      false,
    ]);
    expect(tracker.press('KeyW')).toBe(true);
    const english = ['KeyC', 'KeyL', 'KeyA', 'KeyC', 'KeyK'].map((code) => tracker.press(code));
    expect(english).toEqual([false, false, false, false, true]);
  });

  it('лишние клавиши до слова не мешают, опечатка внутри — мешает', () => {
    const tracker = new SecretWordTracker();
    for (const code of ['Space', 'KeyQ', 'KeyR', 'KeyK', 'KeyF']) tracker.press(code);
    expect(tracker.press('KeyW')).toBe(true);
    for (const code of ['KeyR', 'KeyK', 'KeyX', 'KeyF']) tracker.press(code);
    expect(tracker.press('KeyW')).toBe(false);
  });
});
