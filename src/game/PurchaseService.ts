import type { SaveManager } from '../core/save/SaveManager';
import {
  forgetToken,
  grantPurchase,
  needsGrant,
  productById,
  pruneTokens,
  type PurchaseRecord,
} from '../core/shop/purchases';
import type { Platform } from '../platform';

/** Сколько ждём, пока выдача покупки дойдёт до облака, прежде чем консумировать. */
const SYNC_TIMEOUT_MS = 10_000;

export interface PurchaseServiceDeps {
  platform: Pick<Platform, 'getPurchases' | 'purchase' | 'consumePurchase' | 'syncSave'>;
  /** Текущие сохранения (после входа в аккаунт они другие). */
  save: () => SaveManager;
  /** Что-то выдано: экраны, реклама и баннер узнают об этом. */
  onGranted?: (productId: string) => void;
}

/** Чем кончилась покупка в магазине. */
export type BuyResult = 'bought' | 'cancelled';

/**
 * Покупки (docs/yandex/sdk/sdk-purchases.md, п. 1.13.1). Покупка сначала выдаётся и записывается
 * в облако, и только потом консумируется: иначе при сбое сети игрок потерял бы купленное.
 * Расходуемая покупка выдаётся один раз на токен, даже если консумирование пришлось повторять.
 */
export class PurchaseService {
  private readonly deps: PurchaseServiceDeps;
  /** Покупки обрабатываются по очереди: восстановление при запуске и покупка в магазине не путаются. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(deps: PurchaseServiceDeps) {
    this.deps = deps;
  }

  /**
   * При каждом запуске: выдать необработанные покупки (например, оплаченные перед обрывом
   * сети), восстановить постоянные и забыть токены уже консумированных покупок.
   */
  restore(): Promise<void> {
    return this.enqueue(async () => {
      const owned = await this.deps.platform.getPurchases();
      if (!owned) return;
      for (const purchase of owned) await this.process(purchase);
      const save = this.deps.save();
      const tokens = new Set(owned.map((purchase) => purchase.token));
      if (save.data.purchases.granted.some((token) => !tokens.has(token))) {
        save.update((draft) => {
          pruneTokens(draft, owned);
        });
      }
    });
  }

  /** Купить товар в магазине. */
  buy(productId: string): Promise<BuyResult> {
    return this.enqueue(async () => {
      const purchase = await this.deps.platform.purchase(productId);
      if (!purchase) return 'cancelled';
      await this.process(purchase);
      return 'bought';
    });
  }

  private async process(purchase: PurchaseRecord): Promise<void> {
    const product = productById(purchase.productId);
    if (!product) return;
    const save = this.deps.save();
    if (needsGrant(save.data, purchase)) {
      save.update((draft) => {
        grantPurchase(draft, purchase);
      }, 'urgent');
      this.deps.onGranted?.(product.id);
    }
    // Постоянные покупки не консумируются: их список приходит при каждом запуске.
    if (product.type !== 'consumable') return;
    // Без записи в облако консумировать нельзя: покупка пропала бы. Попробуем при следующем запуске.
    if (!save.writable || !(await this.deps.platform.syncSave(SYNC_TIMEOUT_MS))) return;
    if (await this.deps.platform.consumePurchase(purchase.token)) {
      this.deps.save().update((draft) => forgetToken(draft, purchase.token));
    }
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task, task);
    this.queue = result.catch(() => undefined);
    return result;
  }
}
