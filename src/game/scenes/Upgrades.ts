import Phaser from 'phaser';
import { UPGRADES } from '../../config/balance';
import { buyUpgrade, canBuyUpgrade, upgradePrice } from '../../core/meta/upgrades';
import { UPGRADE_IDS, type UpgradeId } from '../../core/save/schema';
import { formatNumber, type TranslationKey } from '../../i18n';
import { UI_ART, ensureUiArt } from '../art/textures';
import { Button, drawIcon, type ButtonIcon } from '../ui/Button';
import { ScrollPanel } from '../ui/ScrollPanel';
import { COLORS } from '../ui/theme';
import { BaseScene } from './BaseScene';
import { titleStyle } from './titleStyle';

const CARD_WIDTH = 672;
const CARD_HEIGHT = 150;
const CARD_GAP = 14;
const BUY_WIDTH = 200;

/** Как выглядит карточка апгрейда: значок, цвет кружка и тексты. */
const LOOKS: Record<
  UpgradeId,
  { icon: ButtonIcon; color: number; title: TranslationKey; hint: TranslationKey }
> = {
  shake: { icon: 'shake', color: 0x9ff0cf, title: 'upgrades.shake', hint: 'upgrades.shake.hint' },
  remove: {
    icon: 'remove',
    color: 0xffb3c8,
    title: 'upgrades.remove',
    hint: 'upgrades.remove.hint',
  },
  preview: {
    icon: 'preview',
    color: 0x8fd3ff,
    title: 'upgrades.preview',
    hint: 'upgrades.preview.hint',
  },
  squish: {
    icon: 'squish',
    color: 0xffc49b,
    title: 'upgrades.squish',
    hint: 'upgrades.squish.hint',
  },
  golden: {
    icon: 'golden',
    color: 0xffe07a,
    title: 'upgrades.golden',
    hint: 'upgrades.golden.hint',
  },
  jar: { icon: 'jar', color: 0xd7b8ff, title: 'upgrades.jar', hint: 'upgrades.jar.hint' },
};

interface Card {
  id: UpgradeId;
  y: number;
  pips: Phaser.GameObjects.Graphics;
  buy: Button;
  flash: Phaser.GameObjects.Graphics;
}

/**
 * Апгрейды «+1» (диздок, раздел 6): карточка на каждый апгрейд — что даёт, уровень кружочками
 * и цена в монетах. Цена растёт ×1,6 за уровень; на максимуме — «МАКС». Покупка сохраняется сразу.
 */
export class UpgradesScene extends BaseScene {
  private title!: Phaser.GameObjects.Text;
  private coinIcon!: Phaser.GameObjects.Image;
  private balance!: Phaser.GameObjects.Text;
  private back!: Button;
  private panel!: ScrollPanel;
  private cards: Card[] = [];

  constructor() {
    super('Upgrades');
  }

  create(): void {
    this.setupScreen();
    ensureUiArt(this);
    const { t } = this.ctx;
    this.title = this.createText(360, 0, t('upgrades.title'), titleStyle(64)).setOrigin(0.5);
    this.coinIcon = this.add.image(0, 0, UI_ART.coin).setDisplaySize(46, 46);
    this.balance = this.createText(0, 0, '', {
      fontSize: '40px',
      fontStyle: '900',
      color: COLORS.title,
      stroke: '#ffffff',
      strokeThickness: 8,
    }).setOrigin(0, 0.5);
    this.panel = new ScrollPanel(this);
    this.cards = UPGRADE_IDS.map((id, index) =>
      this.createCard(id, index * (CARD_HEIGHT + CARD_GAP)),
    );
    this.panel.setContentHeight(UPGRADE_IDS.length * (CARD_HEIGHT + CARD_GAP) - CARD_GAP + 8);
    this.back = new Button(this, 360, 0, {
      id: 'common.back',
      label: t('common.back'),
      width: 400,
      onClick: () => this.scene.start('Menu'),
    });
    this.onKeyAction((action) => {
      if (action === 'pause' || action === 'drop') this.scene.start('Menu');
    });
    this.refresh();
    this.layoutScreen(this.screenHeight);
  }

  override update(_time: number, delta: number): void {
    this.panel.update(delta);
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
  }

  private placeBalance(y: number): void {
    const width = 46 + 10 + this.balance.width;
    const left = 360 - width / 2;
    this.coinIcon.setPosition(left + 23, y);
    this.balance.setPosition(left + 56, y);
  }

  private createCard(id: UpgradeId, y: number): Card {
    const { t } = this.ctx;
    const look = LOOKS[id];
    const x = 24;
    const background = new Phaser.GameObjects.Graphics(this);
    background.fillStyle(0xffffff, 0.9);
    background.fillRoundedRect(x, y, CARD_WIDTH, CARD_HEIGHT, 32);
    background.lineStyle(3, COLORS.keySide, 1);
    background.strokeRoundedRect(x, y, CARD_WIDTH, CARD_HEIGHT, 32);
    const icon = new Phaser.GameObjects.Graphics(this);
    icon.fillStyle(look.color, 1);
    icon.fillCircle(x + 72, y + CARD_HEIGHT / 2, 52);
    drawIcon(icon, look.icon, x + 72, y + CARD_HEIGHT / 2, 64, 0x3a2e6e);

    const textLeft = x + 140;
    const room = CARD_WIDTH - 140 - BUY_WIDTH - 24;
    const title = this.createText(
      textLeft,
      y + 40,
      t(look.title),
      {
        fontSize: '32px',
        fontStyle: '900',
        color: COLORS.title,
      },
      false,
    ).setOrigin(0, 0.5);
    const hint = this.createText(
      textLeft,
      y + 80,
      t(look.hint),
      {
        fontSize: '22px',
        fontStyle: '700',
        color: '#6b5fb3',
      },
      false,
    ).setOrigin(0, 0.5);
    title.setScale(Math.min(1, room / title.width));
    hint.setScale(Math.min(1, room / hint.width));
    const pips = new Phaser.GameObjects.Graphics(this);
    const flash = new Phaser.GameObjects.Graphics(this);
    flash.fillStyle(0xfff4b8, 1);
    flash.fillRoundedRect(x, y, CARD_WIDTH, CARD_HEIGHT, 32);
    flash.setAlpha(0);
    const buy = new Button(this, x + CARD_WIDTH - BUY_WIDTH / 2 - 18, y + CARD_HEIGHT / 2, {
      id: `upgrades.buy.${id}`,
      label: '',
      icon: 'coin',
      width: BUY_WIDTH,
      height: 110,
      variant: 'primary',
      fontSize: 38,
      onClick: () => this.buy(id),
    });
    this.panel.content.add([background, flash, icon, title, hint, pips, buy]);
    return { id, y, pips, buy, flash };
  }

  /** Цены, уровни и доступность кнопок по текущему сохранению. */
  private refresh(): void {
    const { t, lang, save } = this.ctx;
    const data = save.data;
    this.balance.setText(formatNumber(data.coins, lang));
    this.placeBalance(this.coinIcon.y);
    for (const card of this.cards) {
      const level = data.upgrades[card.id];
      const max = UPGRADES[card.id].maxLevel;
      const price = upgradePrice(card.id, level);
      if (price === null) {
        card.buy.setIcon(null).setText(t('upgrades.max')).setDisabled(true);
      } else {
        card.buy
          .setIcon('coin')
          .setText(formatNumber(price, lang))
          .setDisabled(!canBuyUpgrade(data, card.id));
      }
      const g = card.pips;
      g.clear();
      for (let i = 0; i < max; i += 1) {
        const px = 24 + 140 + 12 + i * 30;
        const py = card.y + 120;
        g.fillStyle(i < level ? 0x3db982 : 0xffffff, 1);
        g.fillCircle(px, py, 10);
        g.lineStyle(3, i < level ? 0x2b8a5f : COLORS.keySide, 1);
        g.strokeCircle(px, py, 10);
      }
    }
  }

  private buy(id: UpgradeId): void {
    let bought = false;
    this.ctx.save.update((draft) => {
      bought = buyUpgrade(draft, id);
    }, 'urgent');
    if (!bought) return;
    this.ctx.audio.achievement();
    this.refresh();
    const card = this.cards.find((item) => item.id === id);
    if (card && !this.ctx.reducedMotion) {
      card.flash.setAlpha(0.9);
      this.tweens.add({ targets: card.flash, alpha: 0, duration: 450, ease: 'Quad.easeOut' });
      this.tweens.add({
        targets: this.coinIcon,
        scale: this.coinIcon.scale * 1.25,
        duration: 120,
        yoyo: true,
      });
    }
  }
}
