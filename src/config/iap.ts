/**
 * Покупки игры (диздок, раздел 8). id совпадают с Консолью Яндекс Игр и с purchases-catalog.json —
 * это проверяет `npm run moderation` (п. 1.13.6: список покупок в игре равен списку в консоли).
 * Цены задаются в консоли в янах. Модуль без импортов: его читает скрипт проверки прямо в Node.
 */
export interface IapProduct {
  id: string;
  /**
   * permanent — постоянная: восстанавливается из getPurchases() при каждом запуске и не консумируется;
   * consumable — расходуемая: выдаётся, сохраняется в облако и только после этого консумируется.
   */
  type: 'permanent' | 'consumable';
  grants: {
    coins?: number;
    /**
     * Убирает всю рекламу, которую показывает игра: полноэкранную и стики-баннер (п. 1.13.5).
     * Остаются реклама за награду (по желанию игрока) и реклама на старте, которую показывает сама платформа.
     */
    noAds?: boolean;
    jarSkins?: number;
    backgrounds?: number;
  };
}

export const IAP_PRODUCTS: readonly IapProduct[] = [
  { id: 'no_ads', type: 'permanent', grants: { noAds: true } },
  { id: 'skins_pack', type: 'permanent', grants: { jarSkins: 3, backgrounds: 2 } },
  { id: 'coins_1000', type: 'consumable', grants: { coins: 1000 } },
];

/**
 * Что сейчас продаётся в магазине игры, по порядку. «Набор украшений» появится в магазине в M4
 * вместе со скинами банки и фонами: без них покупка не соответствовала бы описанию (п. 1.13.5).
 * Его выдача и восстановление из getPurchases() уже работают.
 */
export const SHOP_PRODUCT_IDS: readonly string[] = ['no_ads', 'coins_1000'];
