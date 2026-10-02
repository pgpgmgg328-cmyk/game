import { PROMPTS } from '../../config/balance';
import type { DeepReadonly, Save } from '../save/schema';

/** Что было в забеге: для решения, просить ли оценку. */
export interface ReviewMoment {
  /** Формы, впервые открытые в этом забеге. */
  newForms: readonly { tier: number; golden: boolean }[];
  newRecord: boolean;
  /** Сколько забегов доиграно, вместе с этим. */
  completedRuns: number;
}

/**
 * Хороший момент попросить оценку (диздок, раздел 9): первый Энтер или новый рекорд, начиная
 * с третьего доигранного забега. Просим не больше одного раза — за это отвечает prompts.review.
 */
export function isReviewMoment(moment: ReviewMoment): boolean {
  if (moment.newForms.some((form) => !form.golden && form.tier >= PROMPTS.reviewFormTier)) {
    return true;
  }
  return moment.newRecord && moment.completedRuns >= PROMPTS.reviewRecordFromRun;
}

/** Просить ли оценку сейчас: момент хороший, а раньше не просили. */
export function shouldAskReview(save: DeepReadonly<Save>, moment: ReviewMoment): boolean {
  return !save.prompts.review && isReviewMoment(moment);
}

/** Предлагать ли ярлык на рабочий стол: после пятого забега, пока ярлык не добавлен. */
export function shouldOfferShortcut(save: DeepReadonly<Save>): boolean {
  return !save.prompts.shortcut && save.stats.runs >= PROMPTS.shortcutAfterRuns;
}
