import Phaser from 'phaser';
import { formatNumber } from '../../i18n';
import { DEFAULT_THEME_ID, THEMES, formOf, getTheme } from '../../themes';
import { ensureFxArt, ensureThemeArt } from '../art/textures';
import { Keycap } from '../objects/Keycap';
import { Particles } from '../objects/Particles';
import { Button } from '../ui/Button';
import { COLORS } from '../ui/theme';
import { BaseScene } from './BaseScene';
import type { RunSummary } from './Game';
import { titleStyle } from './titleStyle';

/** Сколько «тикает» счёт до итогового числа. */
const COUNT_MS = 1200;

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
 * Экран результата: счёт со счётчиком-тикалкой, «Новый рекорд!», самая большая клавиша забега,
 * «Ещё раз» и «В меню» (диздок, раздел 9). Монеты и открытые формы добавятся в M2,
 * «▶ ×2 монеты» — в M3.
 */
export class ResultScene extends BaseScene {
  private summary: RunSummary = EMPTY_SUMMARY;
  private title!: Phaser.GameObjects.Text;
  private scoreLabel!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private recordText!: Phaser.GameObjects.Text;
  private keyLabel!: Phaser.GameObjects.Text;
  private keyName!: Phaser.GameObjects.Text;
  private keycap!: Keycap;
  private fx!: Particles;
  private again!: Button;
  private menu!: Button;
  private keyScale = 1;
  private shown = 0;
  private lastTick = 0;
  private counting = 0;
  private revealed = false;

  constructor() {
    super('Result');
  }

  create(data?: Partial<RunSummary>): void {
    this.setupScreen();
    this.summary = { ...EMPTY_SUMMARY, ...data };
    this.shown = 0;
    this.counting = 0;
    this.revealed = false;
    const { t, lang } = this.ctx;
    const theme = getTheme(this.summary.world) ?? THEMES[0]!;
    const tier = Math.min(Math.max(1, this.summary.bestTier), theme.forms.length);
    const art = ensureThemeArt(this, theme, lang)[tier - 1]!;
    ensureFxArt(this);

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
    if (this.ctx.reducedMotion) this.finishCount();
    this.layoutScreen(this.screenHeight);
  }

  override update(time: number, delta: number): void {
    this.keycap.tick(delta, time);
    if (this.revealed) return;
    this.counting = Math.min(COUNT_MS, this.counting + delta);
    const progress = 1 - (1 - this.counting / COUNT_MS) ** 3;
    const next = Math.round(this.summary.score * progress);
    if (next !== this.shown && time - this.lastTick > 80) {
      this.ctx.audio.tick();
      this.lastTick = time;
    }
    this.shown = next;
    this.scoreText.setText(formatNumber(this.shown, this.ctx.lang));
    if (this.counting >= COUNT_MS) this.finishCount();
  }

  protected layoutScreen(height: number): void {
    const compact = height < 1000;
    this.title.setFontSize(compact ? 48 : 60);
    this.title.setPosition(360, (compact ? 24 : Math.min(Math.max(height * 0.06, 40), 110)) + 36);
    this.menu.setPosition(360, height - Math.max(28, height * 0.04) - 55);
    this.again.setPosition(360, this.menu.y - 110 - 24);

    // Очки, рекорд и самая большая клавиша — по центру между заголовком и кнопками.
    // На низком экране (телефон лёжа) блок с клавишей не помещается и прячется.
    const contentTop = this.title.y + 50;
    const room = this.again.y - 55 - 24 - contentTop;
    const showKey = room >= 470;
    const blockHeight = showKey ? 560 : 240;
    const scale = Math.min(1, room / blockHeight);
    const y = contentTop + Math.max(0, (room - blockHeight * scale) / 2);
    this.scoreLabel.setPosition(360, y + 30 * scale);
    this.scoreText.setPosition(360, y + 115 * scale).setScale(Math.max(0.6, scale));
    this.recordText.setPosition(360, y + 205 * scale);
    for (const item of [this.keyLabel, this.keycap, this.keyName]) item.setVisible(showKey);
    this.keyLabel.setPosition(360, y + 290 * scale);
    this.keycap.setPosition(360, y + 405 * scale);
    this.keycap.baseScale = this.keyScale * scale;
    this.keyName.setPosition(360, y + 520 * scale);
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
}
