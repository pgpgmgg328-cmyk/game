import Phaser from 'phaser';
import { DAILY } from '../../config/balance';
import {
  canClaimGift,
  claimGift,
  currentStreak,
  hasRainbowJar,
  taskReward,
} from '../../core/meta/daily';
import { formatNumber } from '../../i18n';
import { formOf, getTheme } from '../../themes';
import { drawJarIcon } from '../art/jarIcon';
import { UI_ART, ensureFxArt, ensureThemeArt, ensureUiArt } from '../art/textures';
import { Keycap } from '../objects/Keycap';
import { Particles } from '../objects/Particles';
import { Button, drawIcon } from '../ui/Button';
import { ScrollPanel } from '../ui/ScrollPanel';
import { COLORS } from '../ui/theme';
import { BaseScene } from './BaseScene';
import { titleStyle } from './titleStyle';

const CARD_X = 24;
const CARD_WIDTH = 672;
const CARD_GAP = 18;
const TASK_HEIGHT = 370;
const STREAK_HEIGHT = 230;
const GIFT_HEIGHT = 260;

/** Тексты карточки: заголовок и подпись. */
const TEXT_COLOR = '#6b5fb3';

/**
 * Ежедневное (диздок, раздел 6): «Клавиша дня» с наградой монетами, неделя подряд (банка
 * «Радуга») и подарок дня — бесплатный и второй за рекламу. Дни — по серверному времени.
 * Никаких таймеров и «успей!»: только что сделать и что за это будет.
 */
export class DailyScene extends BaseScene {
  private title!: Phaser.GameObjects.Text;
  private coinIcon!: Phaser.GameObjects.Image;
  private balance!: Phaser.GameObjects.Text;
  private back!: Button;
  private panel!: ScrollPanel;
  private fx!: Particles;
  private keycap: Keycap | null = null;
  private giftButton: Button | null = null;
  private giftNote!: Phaser.GameObjects.Text;
  private giftY = 0;
  private day = 0;
  private busy = false;

  constructor() {
    super('Daily');
  }

  create(): void {
    this.setupScreen();
    ensureUiArt(this);
    ensureFxArt(this);
    const { t } = this.ctx;
    this.busy = false;
    this.keycap = null;
    this.giftButton = null;
    this.day = this.ctx.rollDaily();
    this.title = this.createText(360, 0, t('daily.title'), titleStyle(64)).setOrigin(0.5);
    this.coinIcon = this.add.image(0, 0, UI_ART.coin).setDisplaySize(46, 46);
    this.balance = this.createText(0, 0, '', {
      fontSize: '40px',
      fontStyle: '900',
      color: COLORS.title,
      stroke: '#ffffff',
      strokeThickness: 8,
    }).setOrigin(0, 0.5);
    this.panel = new ScrollPanel(this);
    let y = 0;
    this.buildTask(y);
    y += TASK_HEIGHT + CARD_GAP;
    this.buildStreak(y);
    y += STREAK_HEIGHT + CARD_GAP;
    this.giftY = y;
    this.buildGift(y);
    y += GIFT_HEIGHT;
    this.panel.setContentHeight(y + 8);
    this.fx = new Particles(this, this.ctx.reducedMotion);
    this.panel.content.add(this.fx.layer);
    this.back = new Button(this, 360, 0, {
      id: 'common.back',
      label: t('common.back'),
      width: 400,
      onClick: () => this.leave(),
    });
    this.onKeyAction((action) => {
      if (action === 'pause') this.leave();
    });
    this.updateBalance();
    this.layoutScreen(this.screenHeight);
  }

  override update(time: number, delta: number): void {
    this.panel.update(delta);
    this.keycap?.tick(delta, time);
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

  private updateBalance(): void {
    this.balance.setText(formatNumber(this.ctx.save.data.coins, this.ctx.lang));
    this.placeBalance(this.coinIcon.y);
  }

  private leave(): void {
    if (this.busy) return;
    this.scene.start('Menu');
  }

  private card(y: number, height: number): Phaser.GameObjects.Graphics {
    const g = new Phaser.GameObjects.Graphics(this);
    g.fillStyle(0xffffff, 0.94);
    g.fillRoundedRect(CARD_X, y, CARD_WIDTH, height, 34);
    g.lineStyle(3, COLORS.keySide, 1);
    g.strokeRoundedRect(CARD_X, y, CARD_WIDTH, height, 34);
    return g;
  }

  private heading(y: number, text: string): Phaser.GameObjects.Text {
    return this.createText(
      CARD_X + 32,
      y + 50,
      text,
      { fontSize: '38px', fontStyle: '900', color: COLORS.title },
      false,
    ).setOrigin(0, 0.5);
  }

  /** Монетка и «+N» справа в заголовке карточки. */
  private reward(y: number, coins: number): Phaser.GameObjects.GameObject[] {
    const text = this.createText(
      CARD_X + CARD_WIDTH - 32,
      y + 50,
      `+${formatNumber(coins, this.ctx.lang)}`,
      { fontSize: '34px', fontStyle: '900', color: '#b8801f' },
      false,
    ).setOrigin(1, 0.5);
    const icon = new Phaser.GameObjects.Image(this, text.x - text.width - 26, y + 50, UI_ART.coin);
    icon.setDisplaySize(40, 40);
    return [text, icon];
  }

  /** «Клавиша дня»: форма, мир и награда; «Играть» — сразу в мир задания. */
  private buildTask(y: number): void {
    const { t, lang, save } = this.ctx;
    const { daily } = save.data;
    const task = daily.task;
    const theme = task ? getTheme(task.world) : null;
    const parts: Phaser.GameObjects.GameObject[] = [
      this.card(y, TASK_HEIGHT),
      this.heading(y, t('daily.task.title')),
    ];
    if (!task || !theme) {
      parts.push(
        this.createText(
          360,
          y + 170,
          t('daily.task.none'),
          {
            fontSize: '28px',
            fontStyle: '800',
            color: TEXT_COLOR,
          },
          false,
        ).setOrigin(0.5),
      );
      this.panel.content.add(parts);
      return;
    }
    parts.push(...this.reward(y, taskReward(task)));
    const tier = Math.min(task.tier, theme.forms.length);
    const art = ensureThemeArt(this, theme, lang)[tier - 1]!;
    const keycap = new Keycap(this, art, { idle: !this.ctx.reducedMotion, random: Math.random });
    keycap.baseScale = Math.min(1.4, 190 / art.width, 120 / art.height);
    keycap.setPosition(CARD_X + 140, y + 158);
    keycap.tick(0, 0);
    this.keycap = keycap;
    const text = this.createText(
      CARD_X + 270,
      y + 158,
      t('daily.task.text', { form: formOf(theme, tier).name[lang], world: theme.name[lang] }),
      {
        fontSize: '30px',
        fontStyle: '800',
        color: COLORS.title,
        wordWrap: { width: CARD_WIDTH - 300, useAdvancedWrap: true },
      },
      false,
    ).setOrigin(0, 0.5);
    parts.push(keycap, text);
    const bottomY = y + TASK_HEIGHT - 72;
    if (daily.taskDone) {
      parts.push(
        this.createText(
          360,
          bottomY,
          t('daily.task.done'),
          {
            fontSize: '32px',
            fontStyle: '900',
            color: '#2b8a5f',
          },
          false,
        ).setOrigin(0.5),
      );
    } else {
      const play = new Button(this, 360, bottomY, {
        id: 'daily.play',
        label: t('daily.play'),
        icon: 'play',
        width: 360,
        variant: 'primary',
        onClick: () => this.playTask(task.world),
      });
      parts.push(play);
    }
    this.panel.content.add(parts);
  }

  private playTask(world: string): void {
    if (this.busy) return;
    this.ctx.save.update((draft) => {
      draft.worlds.selected = world;
    });
    this.scene.start('Game', { world });
  }

  /** Неделя подряд: семь кружков, последний — банка «Радуга». */
  private buildStreak(y: number): void {
    const { t, save } = this.ctx;
    const streak = Math.min(DAILY.streakGoal, currentStreak(save.data, this.day));
    const owned = hasRainbowJar(save.data);
    const g = new Phaser.GameObjects.Graphics(this);
    const step = 82;
    const left = 360 - ((DAILY.streakGoal - 1) * step) / 2;
    const cy = y + 128;
    for (let i = 0; i < DAILY.streakGoal; i += 1) {
      const x = left + i * step;
      const done = i < streak;
      if (i === DAILY.streakGoal - 1) {
        g.fillStyle(done || owned ? 0xfff4b8 : 0xf3f0ff, 1);
        g.fillCircle(x, cy, 36);
        g.lineStyle(4, done || owned ? 0xffd24a : COLORS.keySide, 1);
        g.strokeCircle(x, cy, 36);
        drawJarIcon(g, x, cy, 48, { glass: 0xffffff, edge: 0x8e86b8, pattern: 'rainbow' });
        continue;
      }
      g.fillStyle(done ? COLORS.mintDark : 0xf3f0ff, 1);
      g.fillCircle(x, cy, 30);
      g.lineStyle(4, done ? 0x2b8a5f : COLORS.keySide, 1);
      g.strokeCircle(x, cy, 30);
      if (done) {
        // Галочка.
        g.lineStyle(7, 0xffffff, 1);
        g.beginPath();
        g.moveTo(x - 12, cy);
        g.lineTo(x - 3, cy + 10);
        g.lineTo(x + 13, cy - 10);
        g.strokePath();
      }
    }
    const caption = this.createText(
      360,
      y + STREAK_HEIGHT - 40,
      t(owned ? 'daily.streak.owned' : 'daily.streak.reward'),
      { fontSize: '28px', fontStyle: '800', color: owned ? '#2b8a5f' : TEXT_COLOR },
      false,
    ).setOrigin(0.5);
    caption.setScale(Math.min(1, (CARD_WIDTH - 48) / caption.width));
    this.panel.content.add([
      this.card(y, STREAK_HEIGHT),
      this.heading(y, t('daily.streak.title', { count: streak })),
      g,
      caption,
    ]);
  }

  /** Подарок дня: бесплатный, потом второй — за рекламу, потом «завтра». */
  private buildGift(y: number): void {
    const { t } = this.ctx;
    const icon = new Phaser.GameObjects.Graphics(this);
    icon.fillStyle(0xffd6e8, 1);
    icon.fillCircle(CARD_X + 110, y + 160, 62);
    drawIcon(icon, 'gift', CARD_X + 110, y + 168, 92, 0xe0457b);
    this.giftNote = this.createText(
      CARD_X + 420,
      y + 160,
      '',
      { fontSize: '30px', fontStyle: '900', color: '#2b8a5f', align: 'center' },
      false,
    ).setOrigin(0.5);
    this.panel.content.add([
      this.card(y, GIFT_HEIGHT),
      this.heading(y, t('daily.gift.title')),
      ...this.reward(y, this.ctx.flags.dailyRewardCoins),
      icon,
      this.giftNote,
    ]);
    this.updateGift();
  }

  private updateGift(): void {
    const { t, save } = this.ctx;
    this.giftButton?.destroy();
    this.giftButton = null;
    const free = canClaimGift(save.data, this.day, 'free');
    const ad = canClaimGift(save.data, this.day, 'ad');
    this.giftNote.setVisible(!free && !ad).setText(t('daily.gift.tomorrow'));
    if (!free && !ad) return;
    const button = new Button(this, CARD_X + 420, this.giftY + 160, {
      id: free ? 'daily.gift' : 'daily.adGift',
      label: t(free ? 'daily.gift.take' : 'daily.gift.ad'),
      icon: free ? 'gift' : 'play',
      width: 400,
      variant: free ? 'primary' : 'secondary',
      fontSize: free ? 44 : 34,
      onClick: () => void (free ? this.takeGift() : this.watchGift()),
    });
    this.panel.content.add(button);
    this.giftButton = button;
  }

  /** Бесплатный подарок: монеты сразу в кошелёк, сохраняется сразу. */
  private takeGift(): void {
    if (this.busy) return;
    let taken = false;
    this.ctx.save.update((draft) => {
      taken = claimGift(draft, this.day, 'free', this.ctx.flags.dailyRewardCoins);
    }, 'urgent');
    if (taken) this.celebrateGift();
  }

  /** Второй подарок — за рекламу: монеты только в колбэке onRewarded. */
  private async watchGift(): Promise<void> {
    const button = this.giftButton;
    if (this.busy || !button) return;
    this.busy = true;
    button.setDisabled(true);
    this.back.setDisabled(true);
    let taken = false;
    const result = await this.ctx.ads.rewarded(() => {
      this.ctx.save.update((draft) => {
        taken = claimGift(draft, this.day, 'ad', this.ctx.flags.dailyRewardCoins);
      }, 'urgent');
    });
    if (!this.sys.isActive()) return;
    this.busy = false;
    this.back.setDisabled(false);
    if (taken) {
      this.celebrateGift();
      return;
    }
    button.setDisabled(false);
    if (result === 'error') button.setIcon(null).setText(this.ctx.t('ads.unavailable'));
  }

  private celebrateGift(): void {
    this.ctx.audio.record();
    this.fx.celebrate(CARD_X + 110, this.giftY + 160);
    this.updateBalance();
    this.updateGift();
  }

  /** Состояние экрана для автотестов. */
  debugState(): { day: number; gift: string | null; streak: number } {
    return {
      day: this.day,
      gift: this.giftButton?.id ?? null,
      streak: currentStreak(this.ctx.save.data, this.day),
    };
  }
}
