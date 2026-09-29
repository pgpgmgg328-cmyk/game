import type { AchievementDef } from '../core/meta/achievements';
import type { Lang, Translate, TranslationKey } from '../i18n';
import { getTheme } from '../themes';

const TITLES: Readonly<Record<string, TranslationKey>> = {
  first_clack: 'ach.first_clack',
  caps: 'ach.caps',
  spacebar: 'ach.spacebar',
  mega: 'ach.mega',
  golden_rush: 'ach.golden_rush',
  pianist: 'ach.pianist',
  secret_word: 'ach.secret_word',
};

/** Название достижения на языке игрока. У «Коллекционера» в названии — имя мира. */
export function achievementTitle(def: AchievementDef, t: Translate, lang: Lang): string {
  if (def.world !== undefined) {
    const world = getTheme(def.world);
    return t('ach.collector', { world: world ? world.name[lang] : def.world });
  }
  const key = TITLES[def.id];
  return key ? t(key) : def.id;
}
