import { describe, expect, it } from 'vitest';
import { isReviewMoment, shouldAskReview, shouldOfferShortcut } from '../src/core/meta/prompts';
import { createDefaultSave } from '../src/core/save/schema';

describe('просьба оценить игру', () => {
  it('первый Энтер — хороший момент', () => {
    expect(
      isReviewMoment({
        newForms: [{ tier: 9, golden: false }],
        newRecord: false,
        completedRuns: 1,
      }),
    ).toBe(true);
    // Золотая версия — не новая форма.
    expect(
      isReviewMoment({ newForms: [{ tier: 9, golden: true }], newRecord: false, completedRuns: 1 }),
    ).toBe(false);
    expect(
      isReviewMoment({
        newForms: [{ tier: 8, golden: false }],
        newRecord: false,
        completedRuns: 1,
      }),
    ).toBe(false);
  });

  it('новый рекорд — начиная с третьего доигранного забега', () => {
    expect(isReviewMoment({ newForms: [], newRecord: true, completedRuns: 2 })).toBe(false);
    expect(isReviewMoment({ newForms: [], newRecord: true, completedRuns: 3 })).toBe(true);
    expect(isReviewMoment({ newForms: [], newRecord: false, completedRuns: 9 })).toBe(false);
  });

  it('не больше одного раза', () => {
    const save = createDefaultSave();
    const moment = { newForms: [], newRecord: true, completedRuns: 4 };
    expect(shouldAskReview(save, moment)).toBe(true);
    save.prompts.review = true;
    expect(shouldAskReview(save, moment)).toBe(false);
  });
});

describe('ярлык на рабочий стол', () => {
  it('предлагается после пятого забега, пока не добавлен', () => {
    const save = createDefaultSave();
    save.stats.runs = 4;
    expect(shouldOfferShortcut(save)).toBe(false);
    save.stats.runs = 5;
    expect(shouldOfferShortcut(save)).toBe(true);
    save.prompts.shortcut = true;
    expect(shouldOfferShortcut(save)).toBe(false);
  });
});
