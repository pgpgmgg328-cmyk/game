import { describe, expect, it } from 'vitest';
import { createDefaultSave } from '../src/core/save/schema';
import {
  forgetToken,
  grantPurchase,
  needsGrant,
  ownsProduct,
  pruneTokens,
} from '../src/core/shop/purchases';

describe('выдача покупок', () => {
  it('«Без рекламы» — постоянная: отмечается один раз', () => {
    const save = createDefaultSave();
    const purchase = { productId: 'no_ads', token: 't-ads' };
    expect(ownsProduct(save, 'no_ads')).toBe(false);
    expect(grantPurchase(save, purchase)).toBe(true);
    expect(save.purchases.noAds).toBe(true);
    expect(ownsProduct(save, 'no_ads')).toBe(true);
    expect(needsGrant(save, purchase)).toBe(false);
    expect(grantPurchase(save, purchase)).toBe(false);
    // Токены постоянных покупок не копятся: их не консумируют.
    expect(save.purchases.granted).toEqual([]);
  });

  it('«Набор украшений» отмечается в сохранении', () => {
    const save = createDefaultSave();
    expect(grantPurchase(save, { productId: 'skins_pack', token: 't' })).toBe(true);
    expect(save.purchases.skinsPack).toBe(true);
    expect(ownsProduct(save, 'skins_pack')).toBe(true);
  });

  it('1000 клацов: монеты один раз на токен, токен ждёт консумирования', () => {
    const save = createDefaultSave();
    save.coins = 50;
    const purchase = { productId: 'coins_1000', token: 't-1' };
    expect(grantPurchase(save, purchase)).toBe(true);
    expect(save.coins).toBe(1050);
    expect(save.purchases.granted).toEqual(['t-1']);
    // Консумирование не прошло — покупка пришла снова: второй раз не выдаём.
    expect(needsGrant(save, purchase)).toBe(false);
    expect(grantPurchase(save, purchase)).toBe(false);
    expect(save.coins).toBe(1050);
    // Новая покупка с другим токеном — снова монеты.
    expect(grantPurchase(save, { productId: 'coins_1000', token: 't-2' })).toBe(true);
    expect(save.coins).toBe(2050);
    forgetToken(save, 't-1');
    expect(save.purchases.granted).toEqual(['t-2']);
    expect(ownsProduct(save, 'coins_1000')).toBe(false);
  });

  it('неизвестный товар ничего не даёт', () => {
    const save = createDefaultSave();
    expect(needsGrant(save, { productId: 'gold500', token: 't' })).toBe(false);
    expect(grantPurchase(save, { productId: 'gold500', token: 't' })).toBe(false);
    expect(save).toEqual(createDefaultSave());
  });

  it('забывает токены, которых площадка больше не знает', () => {
    const save = createDefaultSave();
    save.purchases.granted = ['t-1', 't-2', 't-3'];
    expect(pruneTokens(save, [{ productId: 'coins_1000', token: 't-2' }])).toBe(true);
    expect(save.purchases.granted).toEqual(['t-2']);
    expect(pruneTokens(save, [{ productId: 'coins_1000', token: 't-2' }])).toBe(false);
  });
});
