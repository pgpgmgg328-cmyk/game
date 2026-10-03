import Phaser from 'phaser';
import { buyWorld, canBuyWorld, isWorldUnlocked, unlockPrice } from '../../core/meta/worlds';
import { formatNumber } from '../../i18n';
import { THEMES, WORLD_SIZES, type ThemeData } from '../../themes';
import { hexToNumber } from '../art/color';
import { UI_ART, ensureFxArt, ensureThemeArt, ensureUiArt } from '../art/textures';
import { Keycap } from '../objects/Keycap';
import { Particles } from '../objects/Particles';
import { Toasts } from '../objects/Toasts';
import { Button } from '../ui/Button';
import { ScrollPanel } from '../ui/ScrollPanel';
import { COLORS } from '../ui/theme';
import { BaseScene } from './BaseScene';
import { titleStyle } from './titleStyle';

export interface WorldsSceneData {
  /** Мир, к карточке которого прокрутить экран. */
  focus?: string;
  /** Мир только что открыли за монеты: праздник. */
  celebrate?: string;
}

const CARD_WIDTH = 672;
const CARD_HEIGHT = 450;
const CARD_GAP = 18;
/** Формы на карточке: первая, третья и Пробел (неоткрытые — силуэтом). */
const SHOWN_TIERS = [1, 3, 11];

interface WorldCard {
  theme: ThemeData;
  index: number;
  y: number;
  keycaps: Keycap[];
  play: Button | null;
  buy: Button | null;
  /** «Реклама: 1 забег» — меняет надпись, если реклама недоступна. */
  trial: Button | null;
}

/**
 * Экран «Миры» (диздок, разделы 5 и 9): у каждого мира — его особенности, сколько форм открыто
 * и три формы. Закрытый мир открывается Пробелом в прошлом мире или за монеты; ещё его можно
 * попробовать на один забег за рекламу. Монеты и реклама — только по нажатию кнопки.
 */
export class WorldsScene extends BaseScene {
  private title!: Phaser.GameObjects.Text;
  private coinIcon!: Phaser.GameObjects.Image;
  private balance!: Phaser.GameObjects.Text;
  private back!: Button;
  private panel!: ScrollPanel;
  private toasts!: Toasts;
  private fx!: Particles;
  private cards: WorldCard[] = [];
  private focus: string | null = null;
  private busy = false;

  constructor() {
    super('Worlds');
  }

  create(data: WorldsSceneData = {}): void {
    this.setupScreen();
    ensureUiArt(this);
    ensureFxArt(this);
    const { t } = this.ctx;
    this.cards = [];
    this.busy = false;
    this.focus = data.focus ?? null;
    this.title = this.createText(360, 0, t('worlds.title'), titleStyle(64)).setOrigin(0.5);
    this.coinIcon = this.add.image(0, 0, UI_ART.coin).setDisplaySize(46, 46);
    this.balance = this.createText(0, 0, '', {
      fontSize: '40px',
      fontStyle: '900',
      color: COLORS.title,
      stroke: '#ffffff',
      strokeThickness: 8,
    }).setOrigin(0, 0.5);
    this.panel = new ScrollPanel(this);
    THEMES.forEach((theme, index) => this.cards.push(this.createCard(theme, index)));
    this.panel.setContentHeight(THEMES.length * (CARD_HEIGHT + CARD_GAP) - CARD_GAP + 8);
    this.fx = new Particles(this, this.ctx.reducedMotion);
    this.panel.content.add(this.fx.layer);
    this.back = new Button(this, 360, 0, {
      id: 'common.back',
      label: t('common.back'),
      width: 400,
      onClick: () => this.leave(),
    });
    this.toasts = new Toasts(this, this.ctx.reducedMotion);
    this.onKeyAction((action) => {
      if (action === 'pause') this.leave();
    });
    this.updateBalance();
    this.layoutScreen(this.screenHeight);
    if (data.celebrate) this.celebrate(data.celebrate);
  }

  override update(time: number, delta: number): void {
    this.panel.update(delta);
    this.toasts.tick(delta, time);
    this.cards.forEach((card) => card.keycaps.forEach((keycap) => keycap.tick(delta, time)));
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
    const focused = this.cards.find((card) => card.theme.id === this.focus);
    if (focused) this.panel.reveal(focused.y, focused.y + CARD_HEIGHT);
  }

  private placeBalance(y: number): void {
    const width = 46 + 10 + this.balance.width;
    const left = 360 - width / 2;
    this.coinIcon.setPosition(left + 23, y);
    this.balance.setPosition(left + 56, y);
  }

  private updateBalance(): void {
    this.balance.setText(formatNumber(this.ctx.save.data.coins, this.ctx.lang));
    this.placeBalance(this.coinIcon.y);
  }

  private leave(): void {
    if (this.busy) return;
    this.scene.start('Menu');
  }

  private createCard(theme: ThemeData, index: number): WorldCard {
    const { t, lang, save } = this.ctx;
    const data = save.data;
    const y = index * (CARD_HEIGHT + CARD_GAP);
    const x = 24;
    const unlocked = isWorldUnlocked(data, WORLD_SIZES, index);
    const selected = (data.worlds.selected || THEMES[0]!.id) === theme.id;
    const forms = data.album[theme.id]?.forms ?? [];

    const card = new Phaser.GameObjects.Graphics(this);
    card.fillStyle(0xffffff, unlocked ? 0.94 : 0.82);
    card.fillRoundedRect(x, y, CARD_WIDTH, CARD_HEIGHT, 34);
    // Полоска цвета мира сверху карточки.
    card.fillStyle(hexToNumber(theme.palette.skyTop), 1);
    card.fillRoundedRect(x, y, CARD_WIDTH, 16, { tl: 34, tr: 34, bl: 0, br: 0 });
    card.lineStyle(selected ? 6 : 3, selected ? COLORS.mintDark : COLORS.keySide, 1);
    card.strokeRoundedRect(x, y, CARD_WIDTH, CARD_HEIGHT, 34);

    const name = this.createText(
      x + 32,
      y + 58,
      theme.name[lang],
      { fontSize: '40px', fontStyle: '900', color: COLORS.title },
      false,
    ).setOrigin(0, 0.5);
    name.setScale(Math.min(1, (CARD_WIDTH - 64) / name.width));
    const about = this.createText(
      x + 32,
      y + 104,
      theme.about[lang],
      { fontSize: '26px', fontStyle: '700', color: '#6b5fb3' },
      false,
    ).setOrigin(0, 0.5);
    about.setScale(Math.min(1, (CARD_WIDTH - 64) / about.width));
    const found = forms.filter((tier) => tier <= theme.forms.length).length;
    const progress = this.createText(
      x + 32,
      y + 146,
      t('worlds.forms', { found, total: theme.forms.length }),
      { fontSize: '26px', fontStyle: '900', color: COLORS.title },
      false,
    ).setOrigin(0, 0.5);
    const parts: Phaser.GameObjects.GameObject[] = [card, name, about, progress];

    // Три формы мира: открытые — цветные, остальные — силуэтом (тайна для альбома).
    const arts = ensureThemeArt(this, theme, lang);
    const keycaps = SHOWN_TIERS.map((tier, slot) => {
      const art = arts[tier - 1]!;
      const keycap = new Keycap(this, art, {
        idle: !this.ctx.reducedMotion && forms.includes(tier),
        random: Math.random,
      });
      const slotWidth = slot === 2 ? 260 : 150;
      keycap.baseScale = Math.min(1.3, slotWidth / art.width, 96 / art.height);
      const slotX = [x + 110, x + 260, x + 490][slot]!;
      keycap.setPosition(slotX, y + 214);
      if (!forms.includes(tier) && tier > 3) keycap.setSilhouette('#8e86b8', 0.45);
      keycap.tick(0, 0);
      parts.push(keycap);
      return keycap;
    });

    let play: Button | null = null;
    let buy: Button | null = null;
    let trial: Button | null = null;
    const buttonsY = y + CARD_HEIGHT - 76;
    if (unlocked) {
      play = new Button(this, 360, buttonsY, {
        id: `worlds.play.${theme.id}`,
        label: t('worlds.play'),
        icon: 'play',
        width: 360,
        variant: 'primary',
        onClick: () => this.play(theme),
      });
      parts.push(play);
    } else {
      const previous = THEMES[index - 1];
      const hint = this.createText(
        360,
        y + 290,
        t('worlds.locked', { world: previous ? previous.name[lang] : '' }),
        { fontSize: '24px', fontStyle: '800', color: COLORS.title, align: 'center' },
        false,
      ).setOrigin(0.5);
      hint.setScale(Math.min(1, (CARD_WIDTH - 48) / hint.width));
      buy = new Button(this, x + 24 + 135, buttonsY, {
        id: `worlds.buy.${theme.id}`,
        label: formatNumber(unlockPrice(index), lang),
        icon: 'coin',
        width: 270,
        variant: 'primary',
        fontSize: 40,
        onClick: () => this.buy(index),
      });
      buy.setDisabled(!canBuyWorld(data, WORLD_SIZES, index));
      trial = new Button(this, x + CARD_WIDTH - 24 - 170, buttonsY, {
        id: `worlds.try.${theme.id}`,
        label: t('worlds.try'),
        icon: 'play',
        width: 340,
        fontSize: 34,
        onClick: () => void this.tryWorld(theme),
      });
      parts.push(hint, buy, trial);
    }
    this.panel.content.add(parts);
    return { theme, index, y, keycaps, play, buy, trial };
  }

  /** Кнопки по сохранению: открыть за монеты — только если монет хватает. */
  private refreshButtons(): void {
    const data = this.ctx.save.data;
    for (const card of this.cards) {
      card.play?.setDisabled(this.busy);
      card.buy?.setDisabled(this.busy || !canBuyWorld(data, WORLD_SIZES, card.index));
      card.trial?.setDisabled(this.busy);
    }
    this.back.setDisabled(this.busy);
  }

  /** «Играть»: мир выбран в карусели меню, забег сразу. */
  private play(theme: ThemeData): void {
    if (this.busy) return;
    const id = theme.id;
    this.ctx.save.update((draft) => {
      draft.worlds.selected = id;
    });
    this.scene.start('Game', { world: id });
  }

  /** Открыть мир за монеты: сохранение сразу, экран обновляется с праздником. */
  private buy(index: number): void {
    if (this.busy) return;
    let bought = false;
    this.ctx.save.update((draft) => {
      bought = buyWorld(draft, WORLD_SIZES, index);
    }, 'urgent');
    if (!bought) return;
    const id = THEMES[index]!.id;
    this.scene.restart({ focus: id, celebrate: id } satisfies WorldsSceneData);
  }

  private celebrate(id: string): void {
    const card = this.cards.find((item) => item.theme.id === id);
    if (!card) return;
    this.ctx.audio.record();
    this.fx.celebrate(360, card.y + 214);
    this.toasts.show({
      icon: { kind: 'key', art: card.keycaps[0]!.art },
      title: this.ctx.t('worlds.unlocked'),
      detail: card.theme.name[this.ctx.lang],
    });
  }

  /**
   * «Попробовать мир» (диздок, раздел 5): один забег в закрытом мире за рекламу. Забег
   * начинается, только если награда засчитана (колбэк onRewarded).
   */
  private async tryWorld(theme: ThemeData): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.refreshButtons();
    let granted = false;
    const result = await this.ctx.ads.rewarded(() => {
      granted = true;
    });
    if (!this.sys.isActive()) return;
    this.busy = false;
    if (granted) {
      this.scene.start('Game', { world: theme.id, trial: true });
      return;
    }
    this.refreshButtons();
    if (result === 'error') {
      const card = this.cards.find((item) => item.theme.id === theme.id);
      card?.trial?.setIcon(null).setText(this.ctx.t('ads.unavailable'));
    }
  }

  /** Состояние экрана для автотестов. */
  debugState(): { id: string; unlocked: boolean; trial: string | null }[] {
    return this.cards.map((card, index) => ({
      id: card.theme.id,
      unlocked: isWorldUnlocked(this.ctx.save.data, WORLD_SIZES, index),
      trial: card.trial?.text ?? null,
    }));
  }
}
