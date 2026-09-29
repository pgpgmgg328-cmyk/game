import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, COINS, GOLDEN, JAR, UPGRADES } from '../src/config/balance';
import {
  achievementList,
  earnedAchievements,
  grantAchievements,
} from '../src/core/meta/achievements';
import { albumProgress, discoverForm, isDiscovered } from '../src/core/meta/album';
import { endOfRunCoins, mergeCoins } from '../src/core/meta/coins';
import { applyRunOutcome } from '../src/core/meta/progress';
import { buyUpgrade, canBuyUpgrade, runModifiers, upgradePrice } from '../src/core/meta/upgrades';
import { createDefaultSave, UPGRADE_IDS, type Save } from '../src/core/save/schema';

const WORLDS = [{ id: 'classic', forms: 11 }];

function save(change: (draft: Save) => void = () => {}): Save {
  const draft = createDefaultSave();
  change(draft);
  return draft;
}

describe('монеты', () => {
  it('за слияние — номер получившегося тира, с золотой ×3, мега-клац — 100', () => {
    expect(mergeCoins({ kind: 'form', tier: 2 }, false)).toBe(2);
    expect(mergeCoins({ kind: 'form', tier: 9 }, false)).toBe(9);
    expect(mergeCoins({ kind: 'form', tier: 4 }, true)).toBe(4 * COINS.goldenMultiplier);
    expect(mergeCoins({ kind: 'mega' }, false)).toBe(COINS.mega);
    expect(mergeCoins({ kind: 'mega' }, true)).toBe(COINS.mega * COINS.goldenMultiplier);
  });

  it('в конце забега — очки / 100 вниз', () => {
    expect(endOfRunCoins(0)).toBe(0);
    expect(endOfRunCoins(99)).toBe(0);
    expect(endOfRunCoins(12_345)).toBe(123);
  });
});

describe('апгрейды', () => {
  it('цена растёт ×1,6 за уровень, на максимуме купить нельзя', () => {
    expect(upgradePrice('shake', 0)).toBe(UPGRADES.shake.basePrice);
    expect(upgradePrice('shake', 1)).toBe(Math.round(UPGRADES.shake.basePrice * 1.6));
    expect(upgradePrice('shake', 2)).toBe(Math.round(UPGRADES.shake.basePrice * 1.6 ** 2));
    expect(upgradePrice('shake', UPGRADES.shake.maxLevel)).toBeNull();
    expect(upgradePrice('preview', 1)).toBeNull();
  });

  it('покупка списывает монеты и поднимает уровень, без монет — нельзя', () => {
    const draft = save((d) => {
      d.coins = 1000;
    });
    expect(canBuyUpgrade(draft, 'jar')).toBe(true);
    expect(buyUpgrade(draft, 'jar')).toBe(true);
    expect(draft.upgrades.jar).toBe(1);
    expect(draft.coins).toBe(1000 - UPGRADES.jar.basePrice);
    expect(buyUpgrade(draft, 'jar')).toBe(false);
    expect(draft.upgrades.jar).toBe(1);
    expect(canBuyUpgrade(draft, 'jar')).toBe(false);
  });

  it('эффекты: банка шире на 2 %, второе «Далее», сквиш сильнее, золото чаще, заряды', () => {
    const none = runModifiers(save().upgrades);
    expect(none).toEqual({
      jarWidth: JAR.width,
      preview: 1,
      squishPower: 1,
      goldenChance: GOLDEN.chance,
      shakes: 0,
      removes: 0,
    });
    const max = runModifiers({
      shake: 3,
      remove: 3,
      preview: 1,
      squish: 3,
      golden: 5,
      jar: 3,
    });
    expect(max.jarWidth).toBe(Math.round(JAR.width * 1.06));
    expect(max.preview).toBe(2);
    expect(max.squishPower).toBeCloseTo(1.6);
    expect(max.goldenChance).toBeCloseTo(GOLDEN.chance + 0.05);
    expect(max.shakes).toBe(3);
    expect(max.removes).toBe(3);
  });

  it('у каждого апгрейда есть цена и максимум', () => {
    for (const id of UPGRADE_IDS) {
      expect(UPGRADES[id].maxLevel).toBeGreaterThan(0);
      expect(upgradePrice(id, 0)).toBeGreaterThan(0);
    }
  });
});

describe('альбом', () => {
  it('открытие формы, золотая открывает и обычную, повтор — не новость', () => {
    const draft = save();
    expect(discoverForm(draft, 'classic', 3, false)).toEqual({ form: true, golden: false });
    expect(discoverForm(draft, 'classic', 3, false)).toEqual({ form: false, golden: false });
    expect(discoverForm(draft, 'classic', 5, true)).toEqual({ form: true, golden: true });
    expect(discoverForm(draft, 'classic', 1, false)).toEqual({ form: true, golden: false });
    expect(draft.album.classic).toEqual({ forms: [1, 3, 5], golden: [5] });
    expect(isDiscovered(draft.album, 'classic', 5, true)).toBe(true);
    expect(isDiscovered(draft.album, 'classic', 3, true)).toBe(false);
    expect(isDiscovered(draft.album, 'space', 1, false)).toBe(false);
  });

  it('процент коллекции считает обычные и золотые формы', () => {
    const draft = save();
    expect(albumProgress(draft.album, WORLDS)).toEqual({ found: 0, total: 22, percent: 0 });
    for (let tier = 1; tier <= 11; tier += 1) discoverForm(draft, 'classic', tier, false);
    expect(albumProgress(draft.album, WORLDS)).toEqual({ found: 11, total: 22, percent: 50 });
    discoverForm(draft, 'classic', 2, true);
    expect(albumProgress(draft.album, WORLDS).percent).toBe(54);
    expect(albumProgress(draft.album, []).percent).toBe(0);
  });
});

describe('достижения', () => {
  it('выводятся из сохранения и текущего забега', () => {
    expect(earnedAchievements(save(), WORLDS)).toEqual([]);
    expect(earnedAchievements(save(), WORLDS, { merges: 1, goldenMerges: 0, megas: 0 })).toEqual([
      'first_clack',
    ]);
    const rich = save((d) => {
      d.stats.merges = 50;
      d.stats.megas = 1;
      d.stats.goldenMerges = ACHIEVEMENTS.goldenRushMerges;
      d.album.classic = { forms: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], golden: [] };
    });
    expect(earnedAchievements(rich, WORLDS)).toEqual([
      'first_clack',
      'caps',
      'spacebar',
      'mega',
      'golden_rush',
      'collector_classic',
    ]);
  });

  it('выдача: только новые, с наградой монетами; неизвестные игнорируются', () => {
    const draft = save();
    const granted = grantAchievements(draft, ['first_clack', 'pianist', 'нет такого'], WORLDS);
    expect(granted.map((item) => item.id)).toEqual(['first_clack', 'pianist']);
    expect(draft.coins).toBe(ACHIEVEMENTS.first_clack + ACHIEVEMENTS.pianist);
    expect(grantAchievements(draft, ['first_clack'], WORLDS)).toEqual([]);
    expect(draft.coins).toBe(ACHIEVEMENTS.first_clack + ACHIEVEMENTS.pianist);
  });

  it('секретные скрыты, у каждого мира свой коллекционер', () => {
    const list = achievementList([...WORLDS, { id: 'candy', forms: 11 }]);
    expect(list.filter((item) => item.secret).map((item) => item.id)).toEqual([
      'pianist',
      'secret_word',
    ]);
    expect(list.map((item) => item.id)).toContain('collector_candy');
    expect(new Set(list.map((item) => item.id)).size).toBe(list.length);
  });
});

describe('итог забега', () => {
  it('доигранный забег: рекорд, счётчик, статистика, монеты с бонусом', () => {
    const draft = save((d) => {
      d.stats.bestScore = 500;
      d.coins = 10;
    });
    const outcome = applyRunOutcome(draft, {
      score: 1234,
      completed: true,
      merges: 40,
      goldenMerges: 2,
      megas: 0,
      coins: 90,
    });
    expect(outcome).toEqual({ newRecord: true, coins: 90 + 12, bonus: 12 });
    expect(draft.stats).toEqual({
      bestScore: 1234,
      runs: 1,
      merges: 40,
      goldenMerges: 2,
      megas: 0,
    });
    expect(draft.coins).toBe(10 + 102);
  });

  it('брошенный забег: рекорд и монеты за слияния, без бонуса и без счётчика', () => {
    const draft = save((d) => {
      d.stats.bestScore = 5000;
    });
    const outcome = applyRunOutcome(draft, {
      score: 800,
      completed: false,
      merges: 5,
      goldenMerges: 0,
      megas: 0,
      coins: 11,
    });
    expect(outcome).toEqual({ newRecord: false, coins: 11, bonus: 0 });
    expect(draft.stats.runs).toBe(0);
    expect(draft.stats.bestScore).toBe(5000);
    expect(draft.coins).toBe(11);
  });
});
