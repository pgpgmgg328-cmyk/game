import Phaser from 'phaser';
import { SHOP_PRODUCT_IDS } from '../../config/iap';
import { activeDecor, ownsDecor, selectDecor } from '../../core/meta/decor';
import { selectedWorldIndex } from '../../core/meta/worlds';
import { ownsProduct } from '../../core/shop/purchases';
import { formatNumber, type TranslationKey } from '../../i18n';
import type { CatalogProduct } from '../../platform';
import { THEMES, WORLD_SIZES, type ThemeData } from '../../themes';
import { BACKGROUNDS, JAR_SKINS, type BackgroundSkin, type JarSkin } from '../../themes/decor';
import { backdropLook, paintBackdrop } from '../art/backgroundArt';
import { roundRectPath } from '../art/canvas';
import { drawJarIcon, fillStar, jarIconLook } from '../art/jarIcon';
import { UI_ART, ensureUiArt } from '../art/textures';
import { Toasts } from '../objects/Toasts';
import { Button, drawIcon } from '../ui/Button';
import { ScrollPanel } from '../ui/ScrollPanel';
import { COLORS } from '../ui/theme';
import type { BackgroundScene } from './Background';
import { BaseScene } from './BaseScene';
import { titleStyle } from './titleStyle';

const CARD_WIDTH = 672;
const CARD_X = 24;
/** Карточка не ниже этого; длинное описание делает её выше, а не мельче. */
const CARD_MIN_HEIGHT = 200;
const CARD_GAP = 16;
const BUY_WIDTH = 210;
const CURRENCY_SIZE = 40;
/** Карточка с надписью вместо товаров: «Загрузка…» или «Покупки пока недоступны». */
const STATUS_HEIGHT = 150;
const SECTION_GAP = 40;
/** Плитки украшений — по две в ряд. */
const TILE_WIDTH = (CARD_WIDTH - CARD_GAP) / 2;
const TILE_HEIGHT = 340;
/** Превью фона в плитке (логические пиксели) и его текстура — вдвое чётче. */
const PREVIEW = { width: 260, height: 136, radius: 22, density: 2, zoom: 0.55 } as const;
const SELECTED_COLOR = '#2b8a5f';

/** Тексты карточек: название и что именно игрок получит (п. 1.13.5). */
const TEXTS: Record<string, { title: TranslationKey; text: TranslationKey; color: number }> = {
  no_ads: { title: 'shop.no_ads.title', text: 'shop.no_ads.text', color: 0xb8e6ff },
  skins_pack: { title: 'shop.skins_pack.title', text: 'shop.skins_pack.text', color: 0xffd3e4 },
  coins_1000: { title: 'shop.coins_1000.title', text: 'shop.coins_1000.text', color: 0xffe07a },
};

/** Откуда берётся закрытое украшение — подпись под ним. */
const SOURCE_HINTS: Record<'pack' | 'streak', TranslationKey> = {
  pack: 'decor.source.pack',
  streak: 'decor.source.streak',
};

type DecorSkin = JarSkin | BackgroundSkin;

interface Card {
  product: CatalogProduct;
  buy: Button;
  owned: Phaser.GameObjects.Text;
  price: Phaser.GameObjects.Text;
  currency: Phaser.GameObjects.Image | null;
  priceY: number;
  flash: Phaser.GameObjects.Graphics;
}

/** Плитка украшения: превью, имя и кнопка «Выбрать», надпись «Выбрано» или замочек. */
interface Tile {
  item: DecorSkin;
  x: number;
  y: number;
  frame: Phaser.GameObjects.Graphics;
  preview: Phaser.GameObjects.Graphics | Phaser.GameObjects.Image;
  select: Button;
  selected: Phaser.GameObjects.Text;
  check: Phaser.GameObjects.Graphics;
  lock: Phaser.GameObjects.Graphics;
  hint: Phaser.GameObjects.Text;
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
 * случайных наград. Покупка выдаётся сразу и переживает перезапуск. Ниже — «Украшения»:
 * банки и фоны, которые уже есть у игрока, выбираются здесь же; у закрытых написано,
 * откуда они берутся.
 */
export class ShopScene extends BaseScene {
  private title!: Phaser.GameObjects.Text;
  private coinIcon!: Phaser.GameObjects.Image;
  private balance!: Phaser.GameObjects.Text;
  private back!: Button;
  private panel!: ScrollPanel;
  private toasts!: Toasts;
  /** Надпись вместо товаров (null — товары показаны). */
  private status: Phaser.GameObjects.Text | null = null;
  /** Товары каталога: null — ещё загружаются. */
  private products: CatalogProduct[] | null = null;
  private cards: Card[] = [];
  private tiles: Tile[] = [];
  private buying = false;

  constructor() {
    super('Shop');
  }

  create(): void {
    this.setupScreen();
    ensureUiArt(this);
    const { t } = this.ctx;
    this.products = null;
    this.cards = [];
    this.tiles = [];
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
    this.build();
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
    products.sort((a, b) => SHOP_PRODUCT_IDS.indexOf(a.id) - SHOP_PRODUCT_IDS.indexOf(b.id));
    this.products = products;
    this.build();
    for (const url of new Set(products.map((product) => product.currencyImage))) {
      this.loadCurrencyIcon(url);
    }
  }

  /**
   * Содержимое списка: товары (или надпись вместо них) и украшения под ними. Строится заново,
   * когда пришёл каталог; выбор украшения и покупка только обновляют состояние плиток.
   */
  private build(): void {
    const { t } = this.ctx;
    this.panel.content.removeAll(true);
    this.cards = [];
    this.tiles = [];
    this.status = null;
    let y = 0;
    const products = this.products ?? [];
    if (products.length > 0) {
      for (const product of products) {
        const { card, height } = this.createCard(product, y);
        this.cards.push(card);
        y += height + CARD_GAP;
      }
      y -= CARD_GAP;
    } else {
      this.status = this.createStatus(
        y,
        t(this.products === null ? 'common.loading' : 'shop.unavailable'),
      );
      y += STATUS_HEIGHT;
    }
    y = this.createDecor(y + SECTION_GAP);
    this.panel.setContentHeight(y + 8);
    this.refresh();
  }

  private createStatus(y: number, message: string): Phaser.GameObjects.Text {
    const background = new Phaser.GameObjects.Graphics(this);
    background.fillStyle(0xffffff, 0.85);
    background.fillRoundedRect(CARD_X, y, CARD_WIDTH, STATUS_HEIGHT, 32);
    const text = this.createText(
      360,
      y + STATUS_HEIGHT / 2,
      message,
      {
        fontSize: '36px',
        fontStyle: '800',
        color: COLORS.title,
        align: 'center',
        wordWrap: { width: CARD_WIDTH - 60, useAdvancedWrap: true },
      },
      false,
    ).setOrigin(0.5);
    this.panel.content.add([background, text]);
    return text;
  }

  private createCard(product: CatalogProduct, y: number): { card: Card; height: number } {
    const { t } = this.ctx;
    const look = TEXTS[product.id] ?? TEXTS.coins_1000!;
    const x = CARD_X;
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
      { fontSize: '32px', fontStyle: '900', color: SELECTED_COLOR },
      false,
    )
      .setOrigin(0.5)
      .setVisible(false);
    this.panel.content.add([background, flash, icon, title, text, price, buy, owned]);
    const card: Card = { product, buy, owned, price, currency: null, priceY, flash };
    this.placePrice(card);
    return { card, height };
  }

  /**
   * Значок товара: «без рекламы» — экран с ▶, перечёркнутый; набор украшений — банка
   * в полоску со звёздочками; монеты — горка монет.
   */
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
    } else if (id === 'skins_pack') {
      const candy = JAR_SKINS.find((skin) => skin.id === 'candy') ?? JAR_SKINS[0]!;
      drawJarIcon(g, x - 6, y + 4, 78, jarIconLook(candy, THEMES[0]!.palette));
      g.fillStyle(0xffc93d, 1);
      fillStar(g, x + 30, y - 26, 15);
      fillStar(g, x + 34, y + 18, 9);
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

  /** Раздел «Украшения»: заголовок, банки и фоны плитками по две в ряд. Возвращает низ раздела. */
  private createDecor(top: number): number {
    const { t } = this.ctx;
    const header = this.createText(360, top + 30, t('shop.decor'), titleStyle(52), false);
    this.panel.content.add(header.setOrigin(0.5));
    let y = top + 76;
    y = this.createDecorGroup(y, t('shop.jars'), JAR_SKINS);
    y = this.createDecorGroup(y + 12, t('shop.backgrounds'), BACKGROUNDS);
    return y;
  }

  private createDecorGroup(top: number, label: string, items: readonly DecorSkin[]): number {
    const caption = this.createText(
      CARD_X + 12,
      top + 24,
      label,
      {
        fontSize: '34px',
        fontStyle: '900',
        color: COLORS.title,
        stroke: '#ffffff',
        strokeThickness: 8,
      },
      false,
    ).setOrigin(0, 0.5);
    this.panel.content.add(caption);
    const gridTop = top + 56;
    items.forEach((item, index) => {
      const row = Math.floor(index / 2);
      const alone = index === items.length - 1 && index % 2 === 0;
      // Последняя плитка без пары — по центру.
      const x = alone
        ? CARD_X + (CARD_WIDTH - TILE_WIDTH) / 2
        : CARD_X + (index % 2) * (TILE_WIDTH + CARD_GAP);
      this.tiles.push(this.createTile(item, x, gridTop + row * (TILE_HEIGHT + CARD_GAP)));
    });
    const rows = Math.ceil(items.length / 2);
    return gridTop + rows * (TILE_HEIGHT + CARD_GAP) - CARD_GAP;
  }

  private createTile(item: DecorSkin, x: number, y: number): Tile {
    const { t, lang } = this.ctx;
    const cx = x + TILE_WIDTH / 2;
    const previewY = y + 26 + PREVIEW.height / 2;
    const frame = new Phaser.GameObjects.Graphics(this);
    const preview =
      item.kind === 'jar'
        ? this.jarPreview(item, cx, previewY)
        : this.backgroundPreview(item, cx, previewY);
    const name = this.createText(
      cx,
      y + 192,
      item.name[lang],
      { fontSize: '30px', fontStyle: '900', color: COLORS.title },
      false,
    ).setOrigin(0.5);
    name.setScale(Math.min(1, (TILE_WIDTH - 36) / name.width));
    const bottomY = y + TILE_HEIGHT - 68;
    const select = new Button(this, cx, bottomY, {
      id: `decor.${item.kind}.${item.id}`,
      label: t('decor.select'),
      width: 250,
      height: 110,
      variant: 'primary',
      fontSize: 36,
      onClick: () => this.select(item),
    });
    const selected = this.createText(
      cx + 20,
      bottomY,
      t('decor.selected'),
      { fontSize: '32px', fontStyle: '900', color: SELECTED_COLOR },
      false,
    ).setOrigin(0.5);
    const check = new Phaser.GameObjects.Graphics(this);
    // Галочка слева от «Выбрано».
    const checkX = selected.x - selected.width / 2 - 26;
    check.lineStyle(7, COLORS.mintDark, 1);
    check.beginPath();
    check.moveTo(checkX - 13, bottomY);
    check.lineTo(checkX - 4, bottomY + 10);
    check.lineTo(checkX + 13, bottomY - 10);
    check.strokePath();
    const lock = new Phaser.GameObjects.Graphics(this);
    const lockX = cx + PREVIEW.width / 2 - 14;
    const lockY = y + 30;
    lock.fillStyle(0xffffff, 1);
    lock.fillCircle(lockX, lockY, 28);
    lock.lineStyle(4, COLORS.keySide, 1);
    lock.strokeCircle(lockX, lockY, 28);
    drawIcon(lock, 'lock', lockX, lockY - 2, 46, 0x3a2e6e);
    const source = item.source === 'default' ? null : SOURCE_HINTS[item.source];
    const hint = this.createText(
      cx,
      bottomY,
      source ? t(source) : '',
      {
        fontSize: '24px',
        fontStyle: '800',
        color: '#6b5fb3',
        align: 'center',
        wordWrap: { width: TILE_WIDTH - 40, useAdvancedWrap: true },
      },
      false,
    ).setOrigin(0.5);
    this.panel.content.add([frame, preview, name, select, selected, check, lock, hint]);
    return { item, x, y, frame, preview, select, selected, check, lock, hint };
  }

  /** Тема для превью: выбранный в меню мир — обычная банка и фон мира показаны в его цветах. */
  private previewTheme(): ThemeData {
    return THEMES[selectedWorldIndex(this.ctx.save.data, WORLD_SIZES)] ?? THEMES[0]!;
  }

  /** Банка рисуется вокруг своей точки: так она «подпрыгивает» на месте при выборе. */
  private jarPreview(item: JarSkin, x: number, y: number): Phaser.GameObjects.Graphics {
    const g = new Phaser.GameObjects.Graphics(this);
    drawJarIcon(g, 0, 0, PREVIEW.height, jarIconLook(item, this.previewTheme().palette));
    return g.setPosition(x, y);
  }

  /**
   * Превью фона: тот же рисунок, что и на экране (градиент, узор, парящие клавиши), только
   * мельче, в рамке со скруглёнными углами. Текстура рисуется один раз на фон и мир.
   */
  private backgroundPreview(item: BackgroundSkin, x: number, y: number): Phaser.GameObjects.Image {
    const theme = this.previewTheme();
    const key = `decor-bg:${item.id}:${item.look ? 'any' : theme.id}`;
    if (!this.textures.exists(key)) {
      const width = PREVIEW.width * PREVIEW.density;
      const height = PREVIEW.height * PREVIEW.density;
      const texture = this.textures.createCanvas(key, width, height);
      if (texture) {
        const ctx = texture.getContext();
        ctx.save();
        roundRectPath(ctx, 0, 0, width, height, PREVIEW.radius * PREVIEW.density);
        ctx.clip();
        paintBackdrop(
          ctx,
          width,
          height,
          backdropLook(theme, item),
          PREVIEW.density * PREVIEW.zoom,
          true,
        );
        ctx.restore();
        texture.refresh();
      }
    }
    return new Phaser.GameObjects.Image(this, x, y, key).setDisplaySize(
      PREVIEW.width,
      PREVIEW.height,
    );
  }

  /** Рамка плитки: выбранное украшение обведено ярче. */
  private drawTileFrame(tile: Tile, chosen: boolean): void {
    const g = tile.frame;
    g.clear();
    g.fillStyle(chosen ? 0xf0fff6 : 0xffffff, 0.92);
    g.fillRoundedRect(tile.x, tile.y, TILE_WIDTH, TILE_HEIGHT, 30);
    g.lineStyle(chosen ? 6 : 3, chosen ? COLORS.mintDark : COLORS.keySide, 1);
    g.strokeRoundedRect(tile.x, tile.y, TILE_WIDTH, TILE_HEIGHT, 30);
    if (tile.item.kind === 'background') {
      // Рамка вокруг превью фона.
      const left = tile.x + (TILE_WIDTH - PREVIEW.width) / 2;
      g.lineStyle(4, COLORS.keySide, 1);
      g.strokeRoundedRect(left, tile.y + 26, PREVIEW.width, PREVIEW.height, PREVIEW.radius);
    }
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

  /**
   * Баланс, кнопки товаров и плитки украшений по сохранению: купленное навсегда — «Куплено»,
   * выбранное украшение — «Выбрано», закрытое — замочек и откуда его взять.
   */
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
    const chosen = {
      jar: activeDecor(save.data, JAR_SKINS).id,
      background: activeDecor(save.data, BACKGROUNDS).id,
    };
    for (const tile of this.tiles) {
      const owned = ownsDecor(save.data, tile.item);
      const isChosen = chosen[tile.item.kind] === tile.item.id;
      tile.select.setVisible(owned && !isChosen).setDisabled(this.buying);
      tile.selected.setVisible(isChosen);
      tile.check.setVisible(isChosen);
      tile.lock.setVisible(!owned);
      tile.hint.setVisible(!owned);
      tile.preview.setAlpha(owned ? 1 : 0.55);
      this.drawTileFrame(tile, isChosen);
    }
  }

  /** Выбрать банку или фон: сохраняется сразу, фон меняется тут же, банка — в следующем забеге. */
  private select(item: DecorSkin): void {
    if (this.buying) return;
    let changed = false;
    this.ctx.save.update((draft) => {
      changed = selectDecor(draft, item);
    });
    if (!changed) return;
    if (item.kind === 'background') {
      (this.scene.get('Background') as BackgroundScene | null)?.refreshDecor();
    }
    this.refresh();
    const tile = this.tiles.find((entry) => entry.item === item);
    if (tile && !this.ctx.reducedMotion) {
      const { preview } = tile;
      const scaleX = preview.scaleX;
      const scaleY = preview.scaleY;
      this.tweens.add({
        targets: preview,
        scaleX: scaleX * 1.08,
        scaleY: scaleY * 1.08,
        duration: 120,
        yoyo: true,
        ease: 'Quad.easeOut',
      });
    }
  }

  /** Состояние магазина для автотестов: надпись вместо карточек, карточки и украшения. */
  debugState(): {
    status: string | null;
    cards: { id: string; price: string; currencyIcon: boolean; owned: boolean }[];
    decor: { id: string; kind: string; owned: boolean; selected: boolean }[];
  } {
    return {
      status: this.status ? this.status.text : null,
      cards: this.cards.map((card) => ({
        id: card.product.id,
        price: card.price.text,
        currencyIcon: card.currency !== null,
        owned: card.owned.visible,
      })),
      decor: this.tiles.map((tile) => ({
        id: tile.item.id,
        kind: tile.item.kind,
        owned: !tile.lock.visible,
        selected: tile.selected.visible,
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
