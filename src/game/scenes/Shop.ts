import Phaser from 'phaser';
import { SHOP_PRODUCT_IDS } from '../../config/iap';
import { ownsProduct } from '../../core/shop/purchases';
import { formatNumber, type TranslationKey } from '../../i18n';
import type { CatalogProduct } from '../../platform';
import { UI_ART, ensureUiArt } from '../art/textures';
import { Toasts } from '../objects/Toasts';
import { Button, drawIcon } from '../ui/Button';
import { ScrollPanel } from '../ui/ScrollPanel';
import { COLORS } from '../ui/theme';
import { BaseScene } from './BaseScene';
import { titleStyle } from './titleStyle';

const CARD_WIDTH = 672;
/** Карточка не ниже этого; длинное описание делает её выше, а не мельче. */
const CARD_MIN_HEIGHT = 200;
const CARD_GAP = 16;
const BUY_WIDTH = 210;
const CURRENCY_SIZE = 40;

/** Тексты карточек: название и что именно игрок получит (п. 1.13.5). */
const TEXTS: Record<string, { title: TranslationKey; text: TranslationKey; color: number }> = {
  no_ads: { title: 'shop.no_ads.title', text: 'shop.no_ads.text', color: 0xb8e6ff },
  coins_1000: { title: 'shop.coins_1000.title', text: 'shop.coins_1000.text', color: 0xffe07a },
};

interface Card {
  product: CatalogProduct;
  buy: Button;
  owned: Phaser.GameObjects.Text;
  price: Phaser.GameObjects.Text;
  currency: Phaser.GameObjects.Image | null;
  priceY: number;
  flash: Phaser.GameObjects.Graphics;
}

/** Ключ текстуры иконки валюты: у всех товаров она обычно одна и та же. */
function currencyKey(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i += 1) hash = (Math.imul(hash, 31) + url.charCodeAt(i)) >>> 0;
  return `currency:${hash.toString(36)}`;
}

/**
 * Магазин (диздок, раздел 8): открывается только по кнопке. Товары — из каталога площадки,
 * цена с иконкой и кодом портальной валюты из SDK (п. 1.13.2). Без давления, таймеров и
 * случайных наград. Покупка выдаётся сразу и переживает перезапуск.
 */
export class ShopScene extends BaseScene {
  private title!: Phaser.GameObjects.Text;
  private coinIcon!: Phaser.GameObjects.Image;
  private balance!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;
  private back!: Button;
  private panel!: ScrollPanel;
  private toasts!: Toasts;
  private cards: Card[] = [];
  private buying = false;

  constructor() {
    super('Shop');
  }

  create(): void {
    this.setupScreen();
    ensureUiArt(this);
    const { t } = this.ctx;
    this.cards = [];
    this.buying = false;
    this.title = this.createText(360, 0, t('shop.title'), titleStyle(64)).setOrigin(0.5);
    this.coinIcon = this.add.image(0, 0, UI_ART.coin).setDisplaySize(46, 46);
    this.balance = this.createText(0, 0, '', {
      fontSize: '40px',
      fontStyle: '900',
      color: COLORS.title,
      stroke: '#ffffff',
      strokeThickness: 8,
    }).setOrigin(0, 0.5);
    this.status = this.createText(360, 0, t('common.loading'), {
      fontSize: '36px',
      fontStyle: '800',
      color: COLORS.title,
      align: 'center',
      wordWrap: { width: 600, useAdvancedWrap: true },
    }).setOrigin(0.5);
    this.panel = new ScrollPanel(this);
    this.back = new Button(this, 360, 0, {
      id: 'common.back',
      label: t('common.back'),
      width: 400,
      onClick: () => this.leave(),
    });
    this.toasts = new Toasts(this, this.ctx.reducedMotion);
    this.onKeyAction((action) => {
      if (action === 'pause' || action === 'drop') this.leave();
    });
    this.refresh();
    this.layoutScreen(this.screenHeight);
    void this.loadCatalog();
  }

  override update(time: number, delta: number): void {
    this.panel.update(delta);
    this.toasts.tick(delta, time);
  }

  protected layoutScreen(height: number): void {
    const compact = height < 1000;
    const titleY = compact ? 54 : Math.min(Math.max(height * 0.06, 60), 120);
    this.title.setFontSize(compact ? 52 : 64).setPosition(360, titleY);
    this.placeBalance(titleY + (compact ? 62 : 78));
    this.back.setPosition(360, height - Math.max(24, height * 0.03) - 55);
    const top = this.coinIcon.y + 44;
    const bottom = this.back.y - 55 - 16;
    this.panel.setArea(0, top, 720, Math.max(100, bottom - top));
    this.status.setPosition(360, (top + bottom) / 2);
    this.toasts.setAnchor(360, top + 60, 680);
  }

  private leave(): void {
    if (this.buying) return;
    this.scene.start('Menu');
  }

  private placeBalance(y: number): void {
    const width = 46 + 10 + this.balance.width;
    const left = 360 - width / 2;
    this.coinIcon.setPosition(left + 23, y);
    this.balance.setPosition(left + 56, y);
  }

  /** Каталог площадки: показываем только товары, которые есть и в игре, и активны в консоли. */
  private async loadCatalog(): Promise<void> {
    const catalog = await this.ctx.platform.getCatalog();
    if (!this.sys.isActive()) return;
    const products = (catalog ?? []).filter((product) =>
      (SHOP_PRODUCT_IDS as readonly string[]).includes(product.id),
    );
    if (products.length === 0) {
      this.status.setText(this.ctx.t('shop.unavailable'));
      return;
    }
    this.status.setVisible(false);
    products.sort((a, b) => SHOP_PRODUCT_IDS.indexOf(a.id) - SHOP_PRODUCT_IDS.indexOf(b.id));
    let y = 0;
    this.cards = products.map((product) => {
      const { card, height } = this.createCard(product, y);
      y += height + CARD_GAP;
      return card;
    });
    this.panel.setContentHeight(y - CARD_GAP + 8);
    this.refresh();
    for (const url of new Set(products.map((product) => product.currencyImage))) {
      this.loadCurrencyIcon(url);
    }
  }

  private createCard(product: CatalogProduct, y: number): { card: Card; height: number } {
    const { t } = this.ctx;
    const look = TEXTS[product.id] ?? TEXTS.coins_1000!;
    const x = 24;
    const textLeft = x + 148;
    const room = CARD_WIDTH - 148 - BUY_WIDTH - 30;
    const title = this.createText(
      textLeft,
      y + 46,
      t(look.title),
      { fontSize: '34px', fontStyle: '900', color: COLORS.title },
      false,
    ).setOrigin(0, 0.5);
    title.setScale(Math.min(1, room / title.width));
    const text = this.createText(
      textLeft,
      y + 76,
      t(look.text),
      {
        fontSize: '24px',
        fontStyle: '700',
        color: '#6b5fb3',
        wordWrap: { width: room, useAdvancedWrap: true },
      },
      false,
    ).setOrigin(0, 0);
    const height = Math.max(CARD_MIN_HEIGHT, 76 + text.height + 22);
    const background = new Phaser.GameObjects.Graphics(this);
    background.fillStyle(0xffffff, 0.92);
    background.fillRoundedRect(x, y, CARD_WIDTH, height, 32);
    background.lineStyle(3, COLORS.keySide, 1);
    background.strokeRoundedRect(x, y, CARD_WIDTH, height, 32);
    const flash = new Phaser.GameObjects.Graphics(this);
    flash.fillStyle(0xfff4b8, 1);
    flash.fillRoundedRect(x, y, CARD_WIDTH, height, 32);
    flash.setAlpha(0);
    const icon = this.drawProductIcon(product.id, x + 76, y + height / 2, look.color);

    // Цена: число и код валюты из каталога, рядом — иконка валюты из SDK (п. 1.13.2).
    const buyX = x + CARD_WIDTH - BUY_WIDTH / 2 - 18;
    const priceY = y + 48;
    const price = this.createText(
      buyX,
      priceY,
      `${product.priceValue} ${product.currencyCode}`,
      { fontSize: '32px', fontStyle: '900', color: COLORS.title },
      false,
    ).setOrigin(0, 0.5);
    const buy = new Button(this, buyX, y + height - 70, {
      id: `shop.buy.${product.id}`,
      label: t('shop.buy'),
      width: BUY_WIDTH,
      height: 110,
      variant: 'primary',
      fontSize: 38,
      onClick: () => void this.buy(product),
    });
    const owned = this.createText(
      buyX,
      y + height - 76,
      t('shop.owned'),
      { fontSize: '32px', fontStyle: '900', color: '#2b8a5f' },
      false,
    )
      .setOrigin(0.5)
      .setVisible(false);
    this.panel.content.add([background, flash, icon, title, text, price, buy, owned]);
    const card: Card = { product, buy, owned, price, currency: null, priceY, flash };
    this.placePrice(card);
    return { card, height };
  }

  /** Значок товара: «без рекламы» — экран с ▶, перечёркнутый; монеты — горка монет. */
  private drawProductIcon(
    id: string,
    x: number,
    y: number,
    color: number,
  ): Phaser.GameObjects.Graphics {
    const g = new Phaser.GameObjects.Graphics(this);
    g.fillStyle(color, 1);
    g.fillCircle(x, y, 56);
    if (id === 'no_ads') {
      g.lineStyle(7, 0x3a2e6e, 1);
      g.strokeRoundedRect(x - 32, y - 24, 64, 46, 10);
      drawIcon(g, 'play', x + 2, y - 1, 30, 0x3a2e6e);
      g.lineStyle(9, 0xe0457b, 1);
      g.lineBetween(x - 36, y + 34, x + 36, y - 36);
    } else {
      for (const [dx, dy] of [
        [-16, 14],
        [16, 14],
        [0, -12],
      ] as const) {
        drawIcon(g, 'coin', x + dx, y + dy, 46, 0x3a2e6e);
      }
    }
    return g;
  }

  /** Цена по центру над кнопкой: иконка валюты слева от числа. */
  private placePrice(card: Card): void {
    const iconWidth = card.currency ? CURRENCY_SIZE + 8 : 0;
    const width = iconWidth + card.price.width;
    const left = card.buy.x - width / 2;
    card.currency?.setPosition(left + CURRENCY_SIZE / 2, card.priceY);
    card.price.setPosition(left + iconWidth, card.priceY);
  }

  /**
   * Иконка портальной валюты по адресу из SDK. Если она не загрузилась, остаётся код валюты
   * из каталога — цена всё равно видна.
   */
  private loadCurrencyIcon(url: string): void {
    if (url === '') return;
    const key = currencyKey(url);
    if (this.textures.exists(key)) {
      this.applyCurrencyIcon(url, key);
      return;
    }
    this.load.setCORS('anonymous');
    this.load.image(key, url);
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      if (this.sys.isActive() && this.textures.exists(key)) this.applyCurrencyIcon(url, key);
    });
    this.load.start();
  }

  private applyCurrencyIcon(url: string, key: string): void {
    for (const card of this.cards) {
      if (card.product.currencyImage !== url || card.currency) continue;
      const image = new Phaser.GameObjects.Image(this, 0, 0, key);
      image.setDisplaySize(CURRENCY_SIZE, CURRENCY_SIZE);
      this.panel.content.add(image);
      card.currency = image;
      this.placePrice(card);
    }
  }

  /** Баланс и состояние кнопок по сохранению: купленное навсегда — «Куплено». */
  private refresh(): void {
    const { lang, save } = this.ctx;
    this.balance.setText(formatNumber(save.data.coins, lang));
    this.placeBalance(this.coinIcon.y);
    for (const card of this.cards) {
      const owned = ownsProduct(save.data, card.product.id);
      card.buy.setVisible(!owned).setDisabled(this.buying);
      if (owned) card.buy.disableInteractive();
      card.owned.setVisible(owned);
    }
  }

  /** Состояние магазина для автотестов: надпись вместо карточек и сами карточки. */
  debugState(): {
    status: string | null;
    cards: { id: string; price: string; currencyIcon: boolean; owned: boolean }[];
  } {
    return {
      status: this.status.visible ? this.status.text : null,
      cards: this.cards.map((card) => ({
        id: card.product.id,
        price: card.price.text,
        currencyIcon: card.currency !== null,
        owned: card.owned.visible,
      })),
    };
  }

  private async buy(product: CatalogProduct): Promise<void> {
    if (this.buying) return;
    this.buying = true;
    this.refresh();
    const result = await this.ctx.purchases.buy(product.id);
    if (!this.sys.isActive()) return;
    this.buying = false;
    this.refresh();
    if (result !== 'bought') return;
    const { t } = this.ctx;
    const look = TEXTS[product.id];
    this.ctx.audio.achievement();
    this.toasts.show({
      icon: { kind: product.id === 'coins_1000' ? 'coin' : 'medal' },
      title: t('shop.thanks'),
      detail: look ? t(look.title) : product.id,
    });
    const card = this.cards.find((item) => item.product.id === product.id);
    if (card && !this.ctx.reducedMotion) {
      card.flash.setAlpha(0.9);
      this.tweens.add({ targets: card.flash, alpha: 0, duration: 450, ease: 'Quad.easeOut' });
    }
  }
}
