import Phaser from 'phaser';
import { achievementList } from '../../core/meta/achievements';
import { shouldAskReview } from '../../core/meta/prompts';
import { formatNumber } from '../../i18n';
import {
  DEFAULT_THEME_ID,
  THEMES,
  WORLD_SIZES,
  formOf,
  getTheme,
  type ThemeData,
} from '../../themes';
import { achievementTitle } from '../achievementText';
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
/** Просьба оценить игру — чуть позже «Нового рекорда!», чтобы ребёнок успел порадоваться. */
const REVIEW_DELAY_MS = 1500;

/** Блоки экрана по порядку важности: низкий экран показывает только первые. */
type Block = 'score' | 'coins' | 'forms' | 'awards' | 'key';
const BLOCKS: readonly Block[] = ['score', 'coins', 'forms', 'awards', 'key'];
const BLOCK_HEIGHT: Record<Block, number> = {
  score: 240,
  coins: 76,
  forms: 200,
  awards: 70,
  key: 330,
};

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
  trial: false,
  unlockedWorld: null,
};

/**
 * Экран результата (диздок, раздел 9): очки со счётчиком-тикалкой, «Новый рекорд!», монеты
 * за забег, открытые формы, самая большая клавиша, «Ещё раз» и «В меню».
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
  private medal!: Phaser.GameObjects.Image;
  private awards!: Phaser.GameObjects.Text;
  private keyLabel!: Phaser.GameObjects.Text;
  private keyName!: Phaser.GameObjects.Text;
  private keycap!: Keycap;
  private fx!: Particles;
  private again!: Button;
  private menu!: Button;
  /** «▶ ×2 монеты» за рекламу; null — монет за забег нет. */
  private double: Button | null = null;
  /** Надпись «Монеты удвоены!» на месте кнопки после награды. */
  private doubledText!: Phaser.GameObjects.Text;
  private keyScale = 1;
  private formScales: number[] = [];
  private shown = 0;
  private shownCoins = 0;
  private lastTick = 0;
  private counting = 0;
  private coinCounting = 0;
  private revealed = false;
  private coinsRevealed = false;
  private leaving = false;
  private watching = false;
  private doubled = false;

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
    this.leaving = false;
    this.watching = false;
    this.doubled = false;
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
    // Достижения этого забега одной строкой: медаль и названия.
    const defs = achievementList(WORLD_SIZES).filter((def) =>
      this.summary.achievements.includes(def.id),
    );
    this.medal = this.add.image(0, 0, UI_ART.medal).setDisplaySize(52, 52);
    // Новый мир — первым: это главная новость забега.
    const opened = this.summary.unlockedWorld ? getTheme(this.summary.unlockedWorld) : null;
    const awards = [
      ...(opened ? [t('result.newWorld', { world: opened.name[lang] })] : []),
      ...defs.map((def) => achievementTitle(def, t, lang)),
    ];
    this.awards = this.createText(0, 0, awards.join(', '), {
      fontSize: '30px',
      fontStyle: '900',
      color: '#b8801f',
    }).setOrigin(0, 0.5);
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

    // Пробный забег в закрытом мире повторяется только за рекламу (диздок, раздел 5).
    const trial = this.summary.trial;
    this.again = new Button(this, 360, 0, {
      id: trial ? 'result.trialAgain' : 'result.again',
      label: t(trial ? 'result.trialAgain' : 'result.again'),
      icon: trial ? 'play' : undefined,
      width: 480,
      variant: 'primary',
      fontSize: trial ? 38 : 44,
      onClick: () => void (trial ? this.trialAgain() : this.leave('Game')),
    });
    this.menu = new Button(this, 360, 0, {
      id: 'result.menu',
      label: t('result.menu'),
      width: 480,
      onClick: () => void this.leave('Menu'),
    });
    // «▶ ×2 монеты» (диздок, раздел 9): по желанию, только если монеты за забег есть.
    this.double =
      this.summary.coins > 0
        ? new Button(this, 360, 0, {
            id: 'result.double',
            label: t('result.double'),
            icon: 'play',
            width: 480,
            fontSize: 40,
            onClick: () => void this.watchDouble(),
          })
        : null;
    this.doubledText = this.createText(360, 0, t('result.doubled'), {
      fontSize: '40px',
      fontStyle: '900',
      color: '#b8801f',
      stroke: '#ffffff',
      strokeThickness: 10,
    })
      .setOrigin(0.5)
      .setVisible(false);
    this.onKeyAction((action) => {
      // Реклама — только осознанным нажатием кнопки, не клавишей.
      if (action === 'drop' && !trial) void this.leave('Game');
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
    this.scheduleReview();
  }

  /**
   * Оценка игры (диздок, раздел 9): после хорошего момента — первый Энтер или новый рекорд
   * с третьего забега — и не больше одного раза. Окно показывает площадка, если разрешает.
   */
  private scheduleReview(): void {
    const { ctx } = this;
    const moment = {
      newForms: this.summary.newForms,
      newRecord: this.summary.newRecord,
      completedRuns: ctx.save.data.stats.runs,
    };
    if (!shouldAskReview(ctx.save.data, moment)) return;
    this.time.delayedCall(COUNT_MS + REVIEW_DELAY_MS, () => {
      if (this.leaving || this.watching) return;
      void ctx.platform.requestReview().then((result) => {
        // Площадка ответила «уже оценили» или окно показано — больше не просим.
        if (result === 'later') return;
        ctx.save.update((draft) => {
          draft.prompts.review = true;
        });
      });
    });
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
    const gap = compact ? 16 : 24;
    this.menu.setPosition(360, height - Math.max(28, height * 0.04) - 55);
    this.again.setPosition(360, this.menu.y - 110 - gap);
    // Кнопка рекламы — над «Ещё раз»; после награды на её месте надпись «Монеты удвоены!».
    const topButtonY = this.double ? this.again.y - 110 - gap : this.again.y;
    this.double?.setPosition(360, topButtonY);
    this.doubledText.setPosition(360, topButtonY);

    // Счёт и монеты — всегда; новые формы и самая большая клавиша — если хватает места.
    const contentTop = this.title.y + 50;
    const room = topButtonY - 55 - 24 - contentTop;
    const wanted: Block[] = ['score', 'coins'];
    if (this.forms.length > 0) wanted.push('forms');
    if (this.awards.text !== '') wanted.push('awards');
    wanted.push('key');
    this.medal.setVisible(false);
    this.awards.setVisible(false);
    const shown: Block[] = [];
    let total = 0;
    for (const block of wanted) {
      if (shown.length >= 2 && total + BLOCK_HEIGHT[block] > room) continue;
      shown.push(block);
      total += BLOCK_HEIGHT[block];
    }
    const scale = Math.min(1, room / total);
    let y = contentTop + Math.max(0, (room - total * scale) / 2);
    // Ненужные блоки (например, новых форм нет) тоже прячем, иначе их надпись висит в углу.
    for (const block of BLOCKS) this.setBlockVisible(block, shown.includes(block));
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
    } else if (block === 'awards') {
      this.medal.setVisible(visible);
      this.awards.setVisible(visible);
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
      case 'awards': {
        const room = 620 - 64;
        const fit = Math.min(1, room / Math.max(1, this.awards.width));
        const width = 52 + 12 + this.awards.width * fit;
        const left = 360 - width / 2;
        this.medal.setPosition(left + 26, y + 34 * scale);
        this.awards.setScale(fit).setPosition(left + 64, y + 34 * scale);
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

  /**
   * «Ещё раз» и «В меню» — логическая пауза между забегами: только здесь может быть
   * полноэкранная реклама (диздок, раздел 8). Она начинается сразу после нажатия, а следующий
   * экран открывается, когда реклама закрыта или не нужна.
   */
  private async leave(target: 'Game' | 'Menu'): Promise<void> {
    if (this.leaving || this.watching) return;
    this.leaving = true;
    for (const button of this.getButtons()) button.setDisabled(true);
    await this.ctx.ads.interstitial();
    if (!this.sys.isActive()) return;
    // «Ещё раз» — в том же мире, что и этот забег.
    if (target === 'Game') this.scene.start('Game', { world: this.summary.world });
    else this.scene.start('Menu');
  }

  /** «▶ Реклама: ещё забег» после пробного забега: новый пробный забег — только за награду. */
  private async trialAgain(): Promise<void> {
    if (this.leaving || this.watching) return;
    this.watching = true;
    for (const button of this.getButtons()) button.setDisabled(true);
    let granted = false;
    const result = await this.ctx.ads.rewarded(() => {
      granted = true;
    });
    if (!this.sys.isActive()) return;
    this.watching = false;
    if (granted) {
      this.leaving = true;
      this.scene.start('Game', { world: this.summary.world, trial: true });
      return;
    }
    for (const button of this.getButtons()) button.setDisabled(false);
    if (result === 'error') this.again.setIcon(null).setText(this.ctx.t('ads.unavailable'));
  }

  /**
   * «▶ ×2 монеты»: монеты забега ещё раз — только в колбэке onRewarded (CLAUDE.md, «Реклама»).
   * Реклама недоступна — кнопка так и говорит; закрыта раньше времени — можно попробовать снова.
   */
  private async watchDouble(): Promise<void> {
    const button = this.double;
    if (!button || this.leaving || this.watching || this.doubled) return;
    this.watching = true;
    for (const item of this.getButtons()) item.setDisabled(true);
    const bonus = this.summary.coins;
    const result = await this.ctx.ads.rewarded(() => {
      if (this.doubled) return;
      this.doubled = true;
      this.ctx.save.update((draft) => {
        draft.coins += bonus;
      }, 'urgent');
    });
    if (!this.sys.isActive()) return;
    this.watching = false;
    this.again.setDisabled(false);
    this.menu.setDisabled(false);
    if (this.doubled) {
      this.showDoubled(bonus);
      return;
    }
    if (result === 'error') {
      button.setIcon(null).setText(this.ctx.t('ads.unavailable'));
      return;
    }
    button.setDisabled(false);
  }

  /** Награда получена: вместо кнопки — «Монеты удвоены!», счётчик монет дотикивает до ×2. */
  private showDoubled(bonus: number): void {
    this.double?.destroy();
    this.double = null;
    this.doubledText.setVisible(true);
    this.finishCoins();
    const from = this.summary.coins;
    const to = from + bonus;
    this.summary = { ...this.summary, coins: to };
    this.ctx.audio.record();
    this.fx.celebrate(this.coinIcon.x, this.coinIcon.y);
    if (this.ctx.reducedMotion) {
      this.setCoins(to);
      return;
    }
    this.doubledText.setScale(0.6);
    this.tweens.add({ targets: this.doubledText, scale: 1, duration: 320, ease: 'Back.easeOut' });
    this.tweens.addCounter({
      from,
      to,
      duration: 700,
      ease: 'Quad.easeOut',
      onUpdate: (tween) => this.setCoins(Math.round(tween.getValue() ?? to)),
    });
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
