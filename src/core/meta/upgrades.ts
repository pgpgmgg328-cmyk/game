import { GOLDEN, JAR, UPGRADES } from '../../config/balance';
import type { DeepReadonly, Save, UpgradeId } from '../save/schema';

/** Цена следующего уровня апгрейда или null, если уровень уже максимальный. */
export function upgradePrice(id: UpgradeId, level: number): number | null {
  const upgrade = UPGRADES[id];
  if (level >= upgrade.maxLevel) return null;
  return Math.round(upgrade.basePrice * UPGRADES.priceGrowth ** level);
}

export function canBuyUpgrade(save: DeepReadonly<Save>, id: UpgradeId): boolean {
  const price = upgradePrice(id, save.upgrades[id]);
  return price !== null && save.coins >= price;
}

/** Покупка апгрейда: списывает монеты и поднимает уровень. false — не хватает монет или максимум. */
export function buyUpgrade(draft: Save, id: UpgradeId): boolean {
  const price = upgradePrice(id, draft.upgrades[id]);
  if (price === null || draft.coins < price) return false;
  draft.coins -= price;
  draft.upgrades[id] += 1;
  return true;
}

/** Что апгрейды меняют в забеге. */
export interface RunModifiers {
  /** Внутренняя ширина банки в единицах физики. */
  jarWidth: number;
  /** Сколько следующих клавиш видно. */
  preview: number;
  /** Множитель силы тап-сквиша. */
  squishPower: number;
  /** Шанс золотой клавиши. */
  goldenChance: number;
  /** Заряды «Встряски» и «Удаления» на забег. */
  shakes: number;
  removes: number;
}

/**
 * Эффекты апгрейдов (диздок, раздел 6). baseGoldenChance — базовый шанс золотой клавиши
 * (в M3 его сможет переопределить флаг goldenChance).
 */
export function runModifiers(
  levels: Readonly<Record<UpgradeId, number>>,
  baseGoldenChance: number = GOLDEN.chance,
): RunModifiers {
  return {
    jarWidth: Math.round(JAR.width * (1 + UPGRADES.jar.widthPerLevel * levels.jar)),
    preview: 1 + levels.preview,
    squishPower: 1 + UPGRADES.squish.powerPerLevel * levels.squish,
    goldenChance: Math.min(1, baseGoldenChance + GOLDEN.chancePerLevel * levels.golden),
    shakes: levels.shake,
    removes: levels.remove,
  };
}
