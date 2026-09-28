import Phaser from 'phaser';
import { restoreSave } from '../../core/save/restore';
import { SaveManager } from '../../core/save/SaveManager';
import { resolveLang } from '../../i18n';
import { loadFonts } from '../fonts';
import { COLORS } from '../ui/theme';
import { BaseScene } from './BaseScene';

const LOGO_SIZE = 220;
const BAR_WIDTH = 420;
const BAR_HEIGHT = 28;

/**
 * Экран загрузки: логотип-клавиша и прогресс-бар, без текста (язык ещё неизвестен).
 * Подключает площадку, загружает шрифт и сохранения, затем открывает меню.
 */
export class PreloadScene extends BaseScene {
  private logo!: Phaser.GameObjects.Graphics;
  private bar!: Phaser.GameObjects.Graphics;
  private progress = 0;
  private shownProgress = 0;
  private centerY = 0;

  constructor() {
    super('Preload');
  }

  create(): void {
    this.setupScreen();
    this.progress = 0;
    this.shownProgress = 0;
    this.logo = this.add.graphics();
    this.bar = this.add.graphics();
    this.layoutScreen(this.screenHeight);
    void this.prepareGame();
  }

  override update(_time: number, delta: number): void {
    if (this.shownProgress >= this.progress) return;
    this.shownProgress = Math.min(this.progress, this.shownProgress + delta / 400);
    this.drawBar();
  }

  protected layoutScreen(height: number): void {
    this.centerY = height * 0.42;
    this.drawLogo();
    this.drawBar();
  }

  private async prepareGame(): Promise<void> {
    const { ctx } = this;
    const platformReady = ctx.platform.init().then(() => this.advance(0.35));
    const fontsReady = loadFonts().then(() => this.advance(0.35));
    await Promise.all([platformReady, fontsReady]);

    const lang = resolveLang(ctx.platform.lang);
    ctx.setLang(lang);
    document.documentElement.lang = lang;
    document.title = ctx.t('game.title');
    ctx.viewport.setDesktop(ctx.platform.deviceType === 'desktop');

    const sources = await ctx.platform.loadSave();
    ctx.setSave(new SaveManager(restoreSave(sources), ctx.platform));
    ctx.audio.setSettings(ctx.save.data.settings);
    this.advance(0.3);

    this.scene.start('Menu');
  }

  private advance(amount: number): void {
    this.progress = Math.min(1, this.progress + amount);
  }

  /** Логотип — клавиша с довольной мордочкой. */
  private drawLogo(): void {
    const g = this.logo;
    const x = 360 - LOGO_SIZE / 2;
    const y = this.centerY - LOGO_SIZE / 2;
    const depth = 24;
    g.clear();
    g.fillStyle(COLORS.mintDark, 1);
    g.fillRoundedRect(x, y + depth, LOGO_SIZE, LOGO_SIZE - depth, 44);
    g.fillStyle(COLORS.mint, 1);
    g.fillRoundedRect(x, y, LOGO_SIZE, LOGO_SIZE - depth, 44);
    g.fillStyle(0xffffff, 0.35);
    g.fillRoundedRect(x + 24, y + 14, LOGO_SIZE - 48, 20, 10);

    const faceY = y + (LOGO_SIZE - depth) / 2;
    g.fillStyle(COLORS.eye, 1);
    g.fillCircle(360 - 40, faceY - 10, 16);
    g.fillCircle(360 + 40, faceY - 10, 16);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(360 - 35, faceY - 16, 5);
    g.fillCircle(360 + 45, faceY - 16, 5);
    g.lineStyle(9, COLORS.eye, 1);
    g.beginPath();
    g.arc(360, faceY + 14, 30, Phaser.Math.DegToRad(20), Phaser.Math.DegToRad(160));
    g.strokePath();
  }

  private drawBar(): void {
    const g = this.bar;
    const x = 360 - BAR_WIDTH / 2;
    const y = this.centerY + LOGO_SIZE / 2 + 70;
    g.clear();
    g.fillStyle(COLORS.track, 0.7);
    g.fillRoundedRect(x, y, BAR_WIDTH, BAR_HEIGHT, BAR_HEIGHT / 2);
    const filled = Math.max(BAR_HEIGHT, BAR_WIDTH * this.shownProgress);
    g.fillStyle(COLORS.mintDark, 1);
    g.fillRoundedRect(x, y, filled, BAR_HEIGHT, BAR_HEIGHT / 2);
  }
}
