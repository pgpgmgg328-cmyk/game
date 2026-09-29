import Phaser from 'phaser';
import { formatNumber } from '../../i18n';
import { DEFAULT_THEME_ID, THEMES, formOf, getTheme, type ThemeData } from '../../themes';
import {
  UI_ART,
  ensureFxArt,
  ensureThemeArt,
  ensureUiArt,
  goldenArt,
  type KeyArt,
} from '../art/textures';
import { Keycap } from '../objects/Keycap';
import { Particles } from '../objects/Particles';
import { Button } from '../ui/Button';
import { COLORS } from '../ui/theme';
import { BaseScene } from './BaseScene';
import type { RunSummary } from './Game';
import { titleStyle } from './titleStyle';

/** Сколько «тикает» счёт до итогового числа. */
const COUNT_MS = 1200;
/** Сколько «тикают» монеты после счёта. */
const COINS_MS = 600;
/** Больше новых форм в строке не показываем: остальные — «+N». */
const MAX_FORMS = 5;

/** Блоки экрана по порядку важности: низкий экран показывает только первые. */
type Block = 'score' | 'coins' | 'forms' | 'key';
const BLOCK_HEIGHT: Record<Block, number> = { score: 240, coins: 76, forms: 200, key: 330 };

const EMPTY_SUMMARY: RunSummary = {
  score: 0,
  best: 0,
  newRecord: false,
  bestTier: 1,
  world: DEFAULT_THEME_ID,
  coins: 0,
  bonus: 0,
  newForms: [],
  achievements: [],
};

/**
 * Экран результата (диздок, раздел 9): очки со счётчиком-тикалкой, «Новый рекорд!», монеты
 * за забег, открытые формы, самая большая клавиша, «Ещё раз» и «В меню».
 * «▶ ×2 монеты» за рекламу появится вместе с рекламой в M3.
 */
export class ResultScene extends BaseScene {
  private summary: RunSummary = EMPTY_SUMMARY;
  private title!: Phaser.GameObjects.Text;
  private scoreLabel!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private recordText!: Phaser.GameObjects.Text;
  private coinIcon!: Phaser.GameObjects.Image;
  private coinText!: Phaser.GameObjects.Text;
  private formsLabel!: Phaser.GameObjects.Text;
  private forms: Keycap[] = [];
  private moreForms!: Phaser.GameObjects.Text;
  private keyLabel!: Phaser.GameObjects.Text;
  private keyName!: Phaser.GameObjects.Text;
  private keycap!: Keycap;
  private fx!: Particles;
  private again!: Button;
  private menu!: Button;
  private keyScale = 1;
  private formScales: number[] = [];
  private shown = 0;
  private shownCoins = 0;
  private lastTick = 0;
  private counting = 0;
  private coinCounting = 0;
  private revealed = false;
  private coinsRevealed = false;

  constructor() {
    super('Result');
  }

  create(data?: Partial<RunSummary>): void {
    this.setupScreen();
    this.summary = { ...EMPTY_SUMMARY, ...data };
    this.shown = 0;
    this.shownCoins = 0;
    this.counting = 0;
    this.coinCounting = 0;
    this.revealed = false;
    this.coinsRevealed = false;
    const { t, lang } = this.ctx;
    const theme = getTheme(this.summary.world) ?? THEMES[0]!;
    const arts = ensureThemeArt(this, theme, lang);
    const tier = Math.min(Math.max(1, this.summary.bestTier), theme.forms.length);
    const art = arts[tier - 1]!;
    ensureFxArt(this);
    ensureUiArt(this);

    this.title = this.createText(360, 0, t('result.title'), titleStyle(60)).setOrigin(0.5);
    this.scoreLabel = this.createText(360, 0, t('result.score'), {
      fontSize: '34px',
      fontStyle: '800',
      color: COLORS.title,
    }).setOrigin(0.5);
    this.scoreText = this.createText(360, 0, '0', titleStyle(104)).setOrigin(0.5);
    this.recordText = this.createText(360, 0, '', {
      fontSize: '38px',
      fontStyle: '900',
      color: COLORS.title,
      stroke: '#ffffff',
      strokeThickness: 8,
    }).setOrigin(0.5);
    this.coinIcon = this.add.image(0, 0, UI_ART.coin).setDisplaySize(56, 56);
    this.coinText = this.createText(0, 0, '+0', {
      fontSize: '52px',
      fontStyle: '900',
      color: '#b8801f',
      stroke: '#ffffff',
      strokeThickness: 10,
    }).setOrigin(0, 0.5);
    this.formsLabel = this.createText(360, 0, t('result.newForms'), {
      fontSize: '30px',
      fontStyle: '800',
      color: COLORS.title,
    }).setOrigin(0.5);
    this.createForms(theme, arts);
    this.keyLabel = this.createText(360, 0, t('result.bestKey'), {
      fontSize: '30px',
      fontStyle: '800',
      color: COLORS.title,
    }).setOrigin(0.5);
    this.keycap = new Keycap(this, art, { idle: !this.ctx.reducedMotion, random: Math.random });
    // Широкие клавиши (Пробел) показываем шире: легендарная форма не должна быть мелкой.
    this.keyScale = Math.min(1.6, 340 / art.width, 150 / art.height);
    this.add.existing(this.keycap);
    this.keyName = this.createText(360, 0, formOf(theme, tier).name[lang], {
      fontSize: '40px',
      fontStyle: '900',
      color: COLORS.title,
    }).setOrigin(0.5);
    this.fx = new Particles(this, this.ctx.reducedMotion);
    this.add.existing(this.fx.layer);

    this.again = new Button(this, 360, 0, {
      id: 'result.again',
      label: t('result.again'),
      width: 480,
      variant: 'primary',
      onClick: () => this.scene.start('Game'),
    });
    this.menu = new Button(this, 360, 0, {
      id: 'result.menu',
      label: t('result.menu'),
      width: 480,
      onClick: () => this.scene.start('Menu'),
    });
    this.onKeyAction((action) => {
      if (action === 'drop') this.scene.start('Game');
    });

    this.recordText.setText(t('game.best', { score: formatNumber(this.summary.best, lang) }));
    this.recordText.setAlpha(0);
    this.forms.forEach((view) => view.setVisible(false));
    this.moreForms.setVisible(false);
    if (this.ctx.reducedMotion) {
      this.finishCount();
      this.finishCoins();
    }
    this.layoutScreen(this.screenHeight);
  }

  override update(time: number, delta: number): void {
    this.keycap.tick(delta, time);
    this.forms.forEach((view) => view.tick(delta, time));
    if (!this.revealed) {
      this.counting = Math.min(COUNT_MS, this.counting + delta);
      const progress = 1 - (1 - this.counting / COUNT_MS) ** 3;
      this.showScore(Math.round(this.summary.score * progress), time);
      if (this.counting >= COUNT_MS) this.finishCount();
      return;
    }
    if (!this.coinsRevealed) {
      this.coinCounting = Math.min(COINS_MS, this.coinCounting + delta);
      const next = Math.round((this.summary.coins * this.coinCounting) / COINS_MS);
      if (next !== this.shownCoins && time - this.lastTick > 70) {
        this.ctx.audio.coin();
        this.lastTick = time;
      }
      this.setCoins(next);
      if (this.coinCounting >= COINS_MS) this.finishCoins();
    }
  }

  protected layoutScreen(height: number): void {
    const compact = height < 1000;
    this.title.setFontSize(compact ? 48 : 60);
    this.title.setPosition(360, (compact ? 24 : Math.min(Math.max(height * 0.06, 40), 110)) + 36);
    this.menu.setPosition(360, height - Math.max(28, height * 0.04) - 55);
    this.again.setPosition(360, this.menu.y - 110 - 24);

    // Счёт и монеты — всегда; новые формы и самая большая клавиша — если хватает места.
    const contentTop = this.title.y + 50;
    const room = this.again.y - 55 - 24 - contentTop;
    const wanted: Block[] = ['score', 'coins'];
    if (this.forms.length > 0) wanted.push('forms');
    wanted.push('key');
    const shown: Block[] = [];
    let total = 0;
    for (const block of wanted) {
      if (shown.length >= 2 && total + BLOCK_HEIGHT[block] > room) continue;
      shown.push(block);
      total += BLOCK_HEIGHT[block];
    }
    const scale = Math.min(1, room / total);
    let y = contentTop + Math.max(0, (room - total * scale) / 2);
    for (const block of wanted) this.setBlockVisible(block, shown.includes(block));
    for (const block of shown) {
      this.placeBlock(block, y, scale);
      y += BLOCK_HEIGHT[block] * scale;
    }
  }

  private setBlockVisible(block: Block, visible: boolean): void {
    if (block === 'forms') {
      this.formsLabel.setVisible(visible);
      const revealed = visible && this.coinsRevealed;
      this.forms.forEach((view) => view.setVisible(revealed));
      this.moreForms.setVisible(revealed && this.summary.newForms.length > MAX_FORMS);
    } else if (block === 'key') {
      for (const item of [this.keyLabel, this.keycap, this.keyName]) item.setVisible(visible);
    }
  }

  private placeBlock(block: Block, y: number, scale: number): void {
    switch (block) {
      case 'score':
        this.scoreLabel.setPosition(360, y + 30 * scale);
        this.scoreText.setPosition(360, y + 115 * scale).setScale(Math.max(0.6, scale));
        this.recordText.setPosition(360, y + 205 * scale);
        return;
      case 'coins':
        this.placeCoins(y + 38 * scale);
        return;
      case 'forms': {
        this.formsLabel.setPosition(360, y + 28 * scale);
        const count = this.forms.length + (this.summary.newForms.length > MAX_FORMS ? 1 : 0);
        const step = Math.min(320, 620 / Math.max(1, count));
        const left = 360 - ((count - 1) * step) / 2;
        this.forms.forEach((view, index) => {
          view.setPosition(left + index * step, y + 122 * scale);
          view.baseScale = (this.formScales[index] ?? 1) * scale;
        });
        this.moreForms.setPosition(left + this.forms.length * step, y + 122 * scale);
        return;
      }
      case 'key':
        this.keyLabel.setPosition(360, y + 40 * scale);
        this.keycap.setPosition(360, y + 160 * scale);
        this.keycap.baseScale = this.keyScale * scale;
        this.keyName.setPosition(360, y + 280 * scale);
        return;
    }
  }

  private placeCoins(y: number): void {
    const width = 56 + 12 + this.coinText.width;
    const left = 360 - width / 2;
    this.coinIcon.setPosition(left + 28, y);
    this.coinText.setPosition(left + 68, y);
  }

  private createForms(theme: ThemeData, arts: readonly KeyArt[]): void {
    const { lang } = this.ctx;
    const found = this.summary.newForms.filter(
      (form) => form.tier >= 1 && form.tier <= arts.length,
    );
    this.forms = [];
    this.formScales = [];
    const shown = found.slice(0, MAX_FORMS);
    // Чем меньше форм, тем шире место под каждую: одинокий Пробел не должен быть крошечным.
    const slotWidth = Math.min(300, 600 / Math.max(1, shown.length) - 20);
    for (const form of shown) {
      const base = arts[form.tier - 1]!;
      const art = form.golden ? goldenArt(this, theme, lang, base) : base;
      const view = new Keycap(this, art, { idle: !this.ctx.reducedMotion, random: Math.random });
      const scale = Math.min(1.4, slotWidth / art.width, 84 / art.height);
      view.baseScale = scale;
      this.add.existing(view);
      this.forms.push(view);
      this.formScales.push(scale);
    }
    this.moreForms = this.createText(0, 0, `+${Math.max(0, found.length - MAX_FORMS)}`, {
      fontSize: '40px',
      fontStyle: '900',
      color: COLORS.title,
    }).setOrigin(0.5);
  }

  private showScore(value: number, time: number): void {
    if (value !== this.shown && time - this.lastTick > 80) {
      this.ctx.audio.tick();
      this.lastTick = time;
    }
    this.shown = value;
    this.scoreText.setText(formatNumber(value, this.ctx.lang));
  }

  private setCoins(value: number): void {
    this.shownCoins = value;
    this.coinText.setText(`+${formatNumber(value, this.ctx.lang)}`);
    this.placeCoins(this.coinIcon.y);
  }

  private finishCount(): void {
    if (this.revealed) return;
    this.revealed = true;
    const { t, lang } = this.ctx;
    this.shown = this.summary.score;
    this.scoreText.setText(formatNumber(this.shown, lang));
    this.recordText.setAlpha(1);
    if (this.summary.newRecord) {
      this.ctx.audio.record();
      this.recordText.setText(t('result.newRecord'));
      this.recordText.setColor('#e0457b');
      this.fx.celebrate(this.recordText.x, this.recordText.y);
      if (!this.ctx.reducedMotion) {
        this.recordText.setScale(0.6);
        this.tweens.add({
          targets: this.recordText,
          scale: 1,
          duration: 360,
          ease: 'Back.easeOut',
        });
      }
    }
  }

  /** Монеты досчитаны: показываем открытые в забеге формы. */
  private finishCoins(): void {
    if (this.coinsRevealed) return;
    this.coinsRevealed = true;
    this.setCoins(this.summary.coins);
    const visible = this.formsLabel.visible;
    this.forms.forEach((view, index) => {
      view.setVisible(visible);
      if (this.ctx.reducedMotion || !visible) return;
      view.pop = 0;
      this.tweens.add({
        targets: view,
        pop: 1,
        delay: index * 90,
        duration: 300,
        ease: 'Back.easeOut',
      });
    });
    this.moreForms.setVisible(visible && this.summary.newForms.length > MAX_FORMS);
    if (this.forms.length > 0 && visible) this.ctx.audio.newForm();
  }
}
