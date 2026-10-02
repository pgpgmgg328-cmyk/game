import { IAP_PRODUCTS, type IapProduct } from '../../config/iap';
import { MAX_GRANTED_TOKENS, type DeepReadonly, type Save } from '../save/schema';

/** Покупка от площадки: какой товар и токен для консумирования. */
export interface PurchaseRecord {
  productId: string;
  token: string;
}

export function productById(id: string): IapProduct | undefined {
  return IAP_PRODUCTS.find((product) => product.id === id);
}

/** Есть ли у игрока постоянная покупка (по сохранению). */
export function ownsProduct(save: DeepReadonly<Save>, id: string): boolean {
  const product = productById(id);
  if (!product || product.type !== 'permanent') return false;
  const { grants } = product;
  if (grants.noAds && !save.purchases.noAds) return false;
  if ((grants.jarSkins || grants.backgrounds) && !save.purchases.skinsPack) return false;
  return true;
}

/**
 * Нужно ли что-то менять в сохранении для этой покупки: постоянная ещё не отмечена,
 * расходуемая с этим токеном ещё не выдана. Неизвестный товар не выдаётся.
 */
export function needsGrant(save: DeepReadonly<Save>, purchase: PurchaseRecord): boolean {
  const product = productById(purchase.productId);
  if (!product) return false;
  if (product.type === 'permanent') return !ownsProduct(save, product.id);
  return !save.purchases.granted.includes(purchase.token);
}

/**
 * Выдать покупку (config/iap.ts). Постоянная отмечается в сохранении; расходуемая начисляется
 * один раз на токен — токен запоминается до консумирования, поэтому повтор из getPurchases()
 * после сбоя консумирования ничего не выдаст второй раз. Возвращает, выдано ли что-то.
 */
export function grantPurchase(draft: Save, purchase: PurchaseRecord): boolean {
  const product = productById(purchase.productId);
  if (!product || !needsGrant(draft, purchase)) return false;
  const { grants } = product;
  if (grants.noAds) draft.purchases.noAds = true;
  if (grants.jarSkins || grants.backgrounds) draft.purchases.skinsPack = true;
  if (product.type === 'consumable') {
    draft.coins += grants.coins ?? 0;
    draft.purchases.granted = [...draft.purchases.granted, purchase.token].slice(
      -MAX_GRANTED_TOKENS,
    );
  }
  return true;
}

/** Покупка консумирована: токен больше не нужен. */
export function forgetToken(draft: Save, token: string): void {
  draft.purchases.granted = draft.purchases.granted.filter((item) => item !== token);
}

/**
 * Токены, которых нет в списке покупок площадки, уже консумированы (например, консумирование
 * прошло, а запись об этом не успела сохраниться): их можно забыть. true — что-то убрали.
 */
export function pruneTokens(draft: Save, owned: readonly PurchaseRecord[]): boolean {
  const alive = new Set(owned.map((purchase) => purchase.token));
  const kept = draft.purchases.granted.filter((token) => alive.has(token));
  if (kept.length === draft.purchases.granted.length) return false;
  draft.purchases.granted = kept;
  return true;
}
