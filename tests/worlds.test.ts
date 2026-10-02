import { describe, expect, it } from 'vitest';
import { WORLDS as WORLD_BALANCE } from '../src/config/balance';
import {
  buyWorld,
  canBuyWorld,
  isWorldUnlocked,
  selectedWorldIndex,
  unlockPrice,
  worldUnlockedBy,
} from '../src/core/meta/worlds';
import { createDefaultSave, type Save } from '../src/core/save/schema';

const WORLDS = [
  { id: 'classic', forms: 11 },
  { id: 'candy', forms: 11 },
  { id: 'space', forms: 11 },
];

function save(change: (draft: Save) => void = () => {}): Save {
  const draft = createDefaultSave();
  change(draft);
  return draft;
}

describe('открытие миров', () => {
  it('цены: первый бесплатно, дальше 3000 и 8000, будущие — дороже на шаг', () => {
    expect(unlockPrice(0)).toBe(0);
    expect(unlockPrice(1)).toBe(3000);
    expect(unlockPrice(2)).toBe(8000);
    expect(unlockPrice(3)).toBe(8000 + WORLD_BALANCE.laterPriceStep);
  });

  it('первый мир открыт сразу, остальные — нет', () => {
    const fresh = save();
    expect(WORLDS.map((_, index) => isWorldUnlocked(fresh, WORLDS, index))).toEqual([
      true,
      false,
      false,
    ]);
    expect(isWorldUnlocked(fresh, WORLDS, 5)).toBe(false);
  });

  it('Пробел в прошлом мире открывает следующий, но не через один', () => {
    const played = save((d) => {
      d.album.classic = { forms: [1, 2, 11], golden: [] };
    });
    expect(isWorldUnlocked(played, WORLDS, 1)).toBe(true);
    expect(isWorldUnlocked(played, WORLDS, 2)).toBe(false);
    // Бэкспейс — ещё не Пробел.
    expect(
      isWorldUnlocked(
        save((d) => (d.album.classic = { forms: [10], golden: [] })),
        WORLDS,
        1,
      ),
    ).toBe(false);
  });

  it('купить за монеты: списывает цену, мир выбран; дважды не купить', () => {
    const draft = save((d) => (d.coins = 3500));
    expect(canBuyWorld(draft, WORLDS, 2)).toBe(false);
    expect(buyWorld(draft, WORLDS, 1)).toBe(true);
    expect(draft.coins).toBe(500);
    expect(draft.worlds).toEqual({ selected: 'candy', bought: ['candy'] });
    expect(isWorldUnlocked(draft, WORLDS, 1)).toBe(true);
    expect(buyWorld(draft, WORLDS, 1)).toBe(false);
    expect(draft.coins).toBe(500);
  });

  it('не хватает монет или мир уже открыт — покупки нет', () => {
    const poor = save((d) => (d.coins = 2999));
    expect(buyWorld(poor, WORLDS, 1)).toBe(false);
    expect(poor.coins).toBe(2999);
    const opened = save((d) => {
      d.coins = 9000;
      d.album.classic = { forms: [11], golden: [] };
    });
    expect(canBuyWorld(opened, WORLDS, 1)).toBe(false);
    expect(buyWorld(opened, WORLDS, 0)).toBe(false);
    expect(opened.coins).toBe(9000);
  });

  it('выбранный мир: неизвестный или пустой — первый', () => {
    expect(selectedWorldIndex(save(), WORLDS)).toBe(0);
    expect(
      selectedWorldIndex(
        save((d) => (d.worlds.selected = 'space')),
        WORLDS,
      ),
    ).toBe(2);
    expect(
      selectedWorldIndex(
        save((d) => (d.worlds.selected = 'autumn')),
        WORLDS,
      ),
    ).toBe(0);
  });

  it('новый Пробел сообщает, какой мир он открыл', () => {
    const fresh = save();
    expect(worldUnlockedBy(fresh, WORLDS, 'classic', 11)).toEqual(WORLDS[1]);
    expect(worldUnlockedBy(fresh, WORLDS, 'classic', 10)).toBeNull();
    // Последний мир ничего не открывает, а купленный мир уже открыт.
    expect(worldUnlockedBy(fresh, WORLDS, 'space', 11)).toBeNull();
    const bought = save((d) => (d.worlds.bought = ['candy']));
    expect(worldUnlockedBy(bought, WORLDS, 'classic', 11)).toBeNull();
  });
});
