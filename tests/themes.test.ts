import { describe, expect, it } from 'vitest';
import { JAR, SCORE, SPAWN, UNIT } from '../src/config/balance';
import { THEMES, formOf, getTheme, labelText, maxTier } from '../src/themes';
import { WORLD1_CLASSIC } from '../src/themes/world1-classic';

const HEX = /^#[0-9a-f]{6}$/;

describe('данные миров', () => {
  it('идентификаторы миров уникальные и латинские', () => {
    const ids = THEMES.map((theme) => theme.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(id).toMatch(/^[a-z0-9-]+$/));
    expect(getTheme('classic')).toBe(WORLD1_CLASSIC);
    expect(getTheme('nope')).toBeNull();
  });

  for (const theme of THEMES) {
    describe(theme.id, () => {
      it('11 форм по порядку тиров', () => {
        expect(maxTier(theme)).toBe(11);
        theme.forms.forEach((form, index) => expect(form.tier).toBe(index + 1));
        expect(formOf(theme, 11)).toBe(theme.forms[10]);
        expect(() => formOf(theme, 12)).toThrow();
      });

      it('каждая следующая форма больше, и все помещаются в банку', () => {
        for (let i = 1; i < theme.forms.length; i += 1) {
          const prev = theme.forms[i - 1]!.size;
          const next = theme.forms[i]!.size;
          expect(next.w * next.h).toBeGreaterThan(prev.w * prev.h);
          expect(next.w).toBeGreaterThanOrEqual(prev.w);
        }
        theme.forms.forEach((form) => {
          expect(form.size.w * UNIT).toBeLessThanOrEqual(JAR.width / 2);
          expect(form.size.h * UNIT).toBeLessThan(JAR.height / 4);
        });
      });

      it('имена и название мира есть на обоих языках и не повторяются', () => {
        for (const lang of ['ru', 'en'] as const) {
          expect(theme.name[lang].trim()).not.toBe('');
          const names = theme.forms.map((form) => form.name[lang].trim());
          names.forEach((name) => expect(name).not.toBe(''));
          expect(new Set(names).size).toBe(names.length);
        }
      });

      it('у каждой формы короткая подпись для альбома на обоих языках', () => {
        for (const lang of ['ru', 'en'] as const) {
          theme.forms.forEach((form) => {
            const caption = form.caption[lang].trim();
            expect(caption, `${theme.id}/${form.tier}/${lang}`).not.toBe('');
            // Одна строка в клетке альбома.
            expect(caption.length, caption).toBeLessThanOrEqual(22);
          });
        }
      });

      it('надписи заданы, цвета корректные', () => {
        theme.forms.forEach((form) => {
          if (form.label.kind === 'text') {
            expect(labelText(form.label, 'ru')?.trim()).toBeTruthy();
            expect(labelText(form.label, 'en')?.trim()).toBeTruthy();
          } else {
            expect(labelText(form.label, 'ru')).toBeNull();
          }
          const colors = form.paint.kind === 'solid' ? [form.paint.color] : form.paint.colors;
          expect(colors.length).toBeGreaterThan(0);
          colors.forEach((color) => expect(color).toMatch(HEX));
        });
        Object.values(theme.palette).forEach((color) => expect(color).toMatch(HEX));
      });

      it('тон звука понижается с ростом тира (диздок, раздел 13)', () => {
        for (let i = 1; i < theme.forms.length; i += 1) {
          expect(theme.forms[i]!.sound.pitch).toBeLessThan(theme.forms[i - 1]!.sound.pitch);
        }
        theme.forms.forEach((form) => {
          expect(form.sound.volume).toBeGreaterThan(0);
          expect(form.sound.volume).toBeLessThanOrEqual(1);
        });
      });
    });
  }

  it('три мира по порядку открытия (диздок, раздел 5)', () => {
    expect(THEMES.map((theme) => theme.id)).toEqual(['classic', 'candy', 'space']);
  });

  it('имена форм не повторяются между мирами, короткие подписи мира заданы', () => {
    for (const lang of ['ru', 'en'] as const) {
      const names = THEMES.flatMap((theme) => theme.forms.map((form) => form.name[lang]));
      expect(new Set(names).size).toBe(names.length);
      for (const theme of THEMES) {
        expect(theme.shortName[lang].length).toBeLessThanOrEqual(10);
        expect(theme.about[lang].trim()).not.toBe('');
        expect(theme.about[lang].length).toBeLessThanOrEqual(40);
      }
    }
  });

  it('никаких чужих брендов и мемов в текстах миров (CLAUDE.md, «Контент»)', () => {
    const banned =
      /roblox|minecraft|skibidi|скибиди|labubu|лабубу|brainrot|брейнрот|windows|apple|google/i;
    for (const theme of THEMES) {
      const texts = [
        ...Object.values(theme.name),
        ...Object.values(theme.about),
        ...theme.forms.flatMap((form) => [
          ...Object.values(form.name),
          ...Object.values(form.caption),
          labelText(form.label, 'ru') ?? '',
          labelText(form.label, 'en') ?? '',
        ]),
      ];
      texts.forEach((text) => expect(text).not.toMatch(banned));
    }
  });

  it('цвета фона миров корректные', () => {
    for (const theme of THEMES) {
      const { stars, sprinkles } = theme.backdrop;
      [...(stars ? [stars] : []), ...(sprinkles ?? [])].forEach((color) =>
        expect(color).toMatch(HEX),
      );
    }
  });

  it('мир 2: упругость 0,35 и «Карамелька» на 3 с; мир 3: гравитация ×0,6 и «Метеорчик» раз в 45 с', () => {
    const candy = getTheme('candy')!;
    expect(candy.physics).toEqual({ restitution: 0.35, gravityScale: 1 });
    expect(candy.specials.caramel?.holdMs).toBe(3000);
    expect(candy.specials.caramel!.chance).toBeGreaterThan(0);
    expect(candy.specials.caramel!.chance).toBeLessThan(0.15);
    expect(candy.specials.meteor).toBeUndefined();
    const space = getTheme('space')!;
    expect(space.physics).toEqual({ restitution: 0.15, gravityScale: 0.6 });
    expect(space.specials.meteor?.everyMs).toBe(45_000);
    expect(space.specials.caramel).toBeUndefined();
    expect(WORLD1_CLASSIC.specials).toEqual({});
  });

  it('мир 1: надпись Буквули зависит от языка, у Пробела корона', () => {
    expect(labelText(formOf(WORLD1_CLASSIC, 3).label, 'ru')).toBe('Ы');
    expect(labelText(formOf(WORLD1_CLASSIC, 3).label, 'en')).toBe('A');
    expect(formOf(WORLD1_CLASSIC, 11).label).toEqual({ kind: 'glyph', glyph: 'crown' });
    expect(formOf(WORLD1_CLASSIC, 11).size).toEqual({ w: 6, h: 2.4 });
    expect(WORLD1_CLASSIC.physics.restitution).toBe(0.15);
  });
});

describe('баланс', () => {
  it('спавн только тиров 1–5, и поздние веса не выше пятого тира', () => {
    expect(SPAWN.weights).toEqual([30, 28, 22, 14, 6]);
    expect(SPAWN.lateWeights).toHaveLength(5);
    [...SPAWN.weights, ...SPAWN.lateWeights].forEach((weight) => expect(weight).toBeGreaterThan(0));
    expect(SPAWN.lateFullSec).toBeGreaterThan(SPAWN.lateStartSec);
  });

  it('поздние веса смещены к тирам 3–5', () => {
    const share = (weights: readonly number[]) =>
      weights.slice(2).reduce((sum, weight) => sum + weight, 0) /
      weights.reduce((sum, weight) => sum + weight, 0);
    expect(share(SPAWN.lateWeights)).toBeGreaterThan(share(SPAWN.weights));
  });

  it('очки растут с тиром, мега-клац больше Пробела', () => {
    expect(SCORE.byTier).toHaveLength(12);
    for (let tier = 3; tier <= 11; tier += 1) {
      expect(SCORE.byTier[tier]).toBeGreaterThan(SCORE.byTier[tier - 1]!);
    }
    expect(SCORE.mega).toBeGreaterThan(SCORE.byTier[11]!);
  });
});
