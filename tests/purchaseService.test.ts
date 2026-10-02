import { describe, expect, it, vi } from 'vitest';
import { SaveManager, type SaveBackend } from '../src/core/save/SaveManager';
import { createDefaultSave, type Save } from '../src/core/save/schema';
import { PurchaseService } from '../src/game/PurchaseService';
import type { OwnedPurchase } from '../src/platform';

function setup(
  options: { owned?: OwnedPurchase[] | null; synced?: boolean; consumeOk?: boolean } = {},
) {
  const events: string[] = [];
  const backend: SaveBackend = {
    persist: (save: Save, urgency) => events.push(`persist:${urgency}:${save.coins}`),
    flush: () => undefined,
  };
  const owned = options.owned === undefined ? [] : options.owned;
  let manager = new SaveManager(
    { save: createDefaultSave(), writable: true, source: 'default' },
    backend,
  );
  const platform = {
    getPurchases: vi.fn(async () => (owned === null ? null : [...owned])),
    purchase: vi.fn(async (id: string): Promise<OwnedPurchase | null> => ({
      productId: id,
      token: `token-${id}`,
    })),
    consumePurchase: vi.fn(async (token: string) => {
      events.push(`consume:${token}`);
      return options.consumeOk ?? true;
    }),
    syncSave: vi.fn(async () => {
      events.push('sync');
      return options.synced ?? true;
    }),
  };
  const granted: string[] = [];
  const service = new PurchaseService({
    platform,
    save: () => manager,
    onGranted: (id) => granted.push(id),
  });
  return {
    service,
    platform,
    events,
    granted,
    get save() {
      return manager.data;
    },
    replaceSave(save: Save, writable = true) {
      manager = new SaveManager({ save, writable, source: 'cloud' }, backend);
    },
  };
}

describe('PurchaseService', () => {
  it('при запуске выдаёт необработанную покупку, пишет в облако и только потом консумирует', async () => {
    const env = setup({ owned: [{ productId: 'coins_1000', token: 't1' }] });
    await env.service.restore();
    expect(env.save.coins).toBe(1000);
    expect(env.events).toEqual([
      'persist:urgent:1000',
      'sync',
      'consume:t1',
      'persist:normal:1000',
    ]);
    expect(env.save.purchases.granted).toEqual([]);
    expect(env.granted).toEqual(['coins_1000']);
  });

  it('восстанавливает постоянные покупки и не консумирует их', async () => {
    const env = setup({ owned: [{ productId: 'no_ads', token: 'p1' }] });
    await env.service.restore();
    expect(env.save.purchases.noAds).toBe(true);
    expect(env.platform.consumePurchase).not.toHaveBeenCalled();
    // Повторный запуск ничего не меняет и ничего не пишет.
    env.events.length = 0;
    await env.service.restore();
    expect(env.events).toEqual([]);
  });

  it('облако не записалось — не консумирует; при следующем запуске монеты не выдаются второй раз', async () => {
    const env = setup({ owned: [{ productId: 'coins_1000', token: 't1' }], synced: false });
    await env.service.restore();
    expect(env.save.coins).toBe(1000);
    expect(env.platform.consumePurchase).not.toHaveBeenCalled();
    expect(env.save.purchases.granted).toEqual(['t1']);
    await env.service.restore();
    expect(env.save.coins).toBe(1000);
  });

  it('консумирование не прошло — токен остаётся, повтор не выдаёт монеты снова', async () => {
    const env = setup({ owned: [{ productId: 'coins_1000', token: 't1' }], consumeOk: false });
    await env.service.restore();
    await env.service.restore();
    expect(env.save.coins).toBe(1000);
    expect(env.platform.consumePurchase).toHaveBeenCalledTimes(2);
    expect(env.save.purchases.granted).toEqual(['t1']);
  });

  it('забывает токены, которых площадка уже не знает', async () => {
    const env = setup({ owned: [] });
    env.replaceSave({
      ...createDefaultSave(),
      purchases: { noAds: false, skinsPack: false, granted: ['old'] },
    });
    await env.service.restore();
    expect(env.save.purchases.granted).toEqual([]);
  });

  it('список покупок недоступен — ничего не меняется', async () => {
    const env = setup({ owned: null });
    await env.service.restore();
    expect(env.events).toEqual([]);
  });

  it('покупка в магазине: выдаётся, а отмена ничего не меняет', async () => {
    const env = setup();
    expect(await env.service.buy('coins_1000')).toBe('bought');
    expect(env.save.coins).toBe(1000);
    expect(env.platform.consumePurchase).toHaveBeenCalledWith('token-coins_1000');
    env.platform.purchase.mockResolvedValueOnce(null);
    expect(await env.service.buy('coins_1000')).toBe('cancelled');
    expect(env.save.coins).toBe(1000);
    expect(await env.service.buy('no_ads')).toBe('bought');
    expect(env.save.purchases.noAds).toBe(true);
  });

  it('сохранение от новой версии игры не пишется — покупку не консумируем', async () => {
    const env = setup({ owned: [{ productId: 'coins_1000', token: 't1' }] });
    env.replaceSave(createDefaultSave(), false);
    await env.service.restore();
    expect(env.platform.consumePurchase).not.toHaveBeenCalled();
  });
});
