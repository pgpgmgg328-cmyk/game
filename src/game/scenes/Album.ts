import Phaser from 'phaser';
import { achievementList, type AchievementDef } from '../../core/meta/achievements';
import { albumProgress, isDiscovered } from '../../core/meta/album';
import { formatNumber } from '../../i18n';
import { THEMES, WORLD_SIZES, type ThemeData } from '../../themes';
import { achievementHint, achievementTitle } from '../achievementText';
import {
  UI_ART,
  ensureFxArt,
  ensureThemeArt,
  ensureUiArt,
  goldenArt,
  type KeyArt,
} from '../art/textures';
import { Keycap } from '../objects/Keycap';
import { Button } from '../ui/Button';
import { ScrollPanel } from '../ui/ScrollPanel';
import { COLORS } from '../ui/theme';
import { BaseScene } from './BaseScene';
import { titleStyle } from './titleStyle';

const COLUMNS = 3;
const CELL_WIDTH = 216;
const CELL_HEIGHT = 262;
const CELL_GAP = 12;
const ROW_HEIGHT = 118;
const SECTION_GAP = 36;
const HEADER_HEIGHT = 78;
const SILHOUETTE = 0x8e86b8;

/** Клетка формы: где лежит (в координатах содержимого) и какая клавиша в ней. */
interface FormCell {
  x: number;
  y: number;
  tier: number;
  opened: boolean;
  keycap: Keycap;
}

/**
 * Альбом (диздок, раздел 6): все формы мира и их золотые версии, открытые — цветные, с именем
 * и смешной подписью, неоткрытые — силуэт с «?». Ниже — достижения; секретные до получения
 * скрыты. Открытую клавишу можно потискать: она сминается и пищит.
 */
export class AlbumScene extends BaseScene {
  private title!: Phaser.GameObjects.Text;
  private progressText!: Phaser.GameObjects.Text;
  private progressBar!: Phaser.GameObjects.Graphics;
  private back!: Button;
  private panel!: ScrollPanel;
  private cells: FormCell[] = [];
  private percent = 0;

  constructor() {
    super('Album');
  }

  create(): void {
    this.setupScreen();
    ensureFxArt(this);
    ensureUiArt(this);
    const { t, save } = this.ctx;
    this.cells = [];
    const progress = albumProgress(save.data.album, WORLD_SIZES);
    this.percent = progress.percent;
    this.title = this.createText(360, 0, t('album.title'), titleStyle(64)).setOrigin(0.5);
    this.progressText = this.createText(
      360,
      0,
      `${t('album.progress', { found: progress.found, total: progress.total })} · ${progress.percent}%`,
      { fontSize: '30px', fontStyle: '800', color: COLORS.title },
    ).setOrigin(0.5);
    this.progressBar = this.add.graphics();
    this.panel = new ScrollPanel(this, (x, y) => this.tapAt(x, y));
    this.panel.setContentHeight(this.buildContent());
    this.back = new Button(this, 360, 0, {
      id: 'common.back',
      label: t('common.back'),
      width: 400,
      onClick: () => this.scene.start('Menu'),
    });
    this.onKeyAction((action) => {
      if (action === 'pause' || action === 'drop') this.scene.start('Menu');
    });
    this.layoutScreen(this.screenHeight);
  }

  override update(time: number, delta: number): void {
    this.panel.update(delta);
    this.cells.forEach((cell) => cell.keycap.tick(delta, time));
  }

  protected layoutScreen(height: number): void {
    const compact = height < 1000;
    const titleY = compact ? 54 : Math.min(Math.max(height * 0.06, 60), 120);
    this.title.setFontSize(compact ? 52 : 64).setPosition(360, titleY);
    this.progressText.setPosition(360, titleY + (compact ? 58 : 72));
    const barY = this.progressText.y + 34;
    this.drawProgress(barY);
    this.back.setPosition(360, height - Math.max(24, height * 0.03) - 55);
    const top = barY + 30;
    const bottom = this.back.y - 55 - 16;
    this.panel.setArea(0, top, 720, Math.max(100, bottom - top));
  }

  private drawProgress(y: number): void {
    const g = this.progressBar;
    const width = 440;
    g.clear();
    g.fillStyle(0xffffff, 0.8);
    g.fillRoundedRect(360 - width / 2, y - 10, width, 20, 10);
    g.fillStyle(0xffd24a, 1);
    const filled = Math.max(20, (width * this.percent) / 100);
    if (this.percent > 0) g.fillRoundedRect(360 - width / 2, y - 10, filled, 20, 10);
    g.lineStyle(3, COLORS.keySide, 1);
    g.strokeRoundedRect(360 - width / 2, y - 10, width, 20, 10);
  }

  /** Строит содержимое альбома и возвращает его высоту. */
  private buildContent(): number {
    let y = 8;
    for (const theme of THEMES) {
      y = this.sectionHeader(theme.name[this.ctx.lang], y);
      const art = ensureThemeArt(this, theme, this.ctx.lang);
      y = this.formGrid(theme, art, false, y);
      y = this.sectionHeader(this.ctx.t('album.golden'), y + SECTION_GAP);
      y = this.formGrid(theme, art, true, y);
      y += SECTION_GAP;
    }
    y = this.sectionHeader(this.ctx.t('album.achievements'), y);
    const owned = this.ctx.save.data.achievements;
    for (const def of achievementList(WORLD_SIZES)) {
      this.achievementRow(def, owned.includes(def.id), y);
      y += ROW_HEIGHT + 10;
    }
    return y + 16;
  }

  private sectionHeader(text: string, y: number): number {
    const label = this.createText(360, y + HEADER_HEIGHT / 2, text, titleStyle(40), false);
    label.setOrigin(0.5);
    this.panel.content.add(label);
    return y + HEADER_HEIGHT;
  }

  private formGrid(
    theme: ThemeData,
    arts: readonly KeyArt[],
    golden: boolean,
    top: number,
  ): number {
    const { lang } = this.ctx;
    const album = this.ctx.save.data.album;
    const rowWidth = COLUMNS * CELL_WIDTH + (COLUMNS - 1) * CELL_GAP;
    const left = 360 - rowWidth / 2;
    theme.forms.forEach((form, index) => {
      const column = index % COLUMNS;
      const row = Math.floor(index / COLUMNS);
      const x = left + column * (CELL_WIDTH + CELL_GAP);
      const y = top + row * (CELL_HEIGHT + CELL_GAP);
      const opened = isDiscovered(album, theme.id, form.tier, golden);
      const base = arts[index]!;
      const art = golden && opened ? goldenArt(this, theme, lang, base) : base;

      const card = new Phaser.GameObjects.Graphics(this);
      card.fillStyle(golden ? 0xfff6d8 : 0xffffff, opened ? 0.9 : 0.5);
      card.fillRoundedRect(x, y, CELL_WIDTH, CELL_HEIGHT, 28);
      card.lineStyle(3, golden && opened ? 0xffd24a : COLORS.keySide, 1);
      card.strokeRoundedRect(x, y, CELL_WIDTH, CELL_HEIGHT, 28);

      const keycap = new Keycap(this, art, {
        idle: opened && !this.ctx.reducedMotion,
        random: Math.random,
      });
      keycap.baseScale = Math.min(1.6, 184 / art.width, 104 / art.height);
      keycap.setPosition(x + CELL_WIDTH / 2, y + 82);
      if (!opened) keycap.setSilhouette(golden ? '#d9b45a' : '#8e86b8', 0.4);
      keycap.tick(0, 0);

      const name = this.createText(
        x + CELL_WIDTH / 2,
        y + 164,
        opened ? form.name[lang] : '???',
        { fontSize: '28px', fontStyle: '900', color: COLORS.title },
        false,
      ).setOrigin(0.5);
      name.setScale(Math.min(1, (CELL_WIDTH - 20) / name.width));
      const parts: Phaser.GameObjects.GameObject[] = [card, keycap, name];
      if (opened) {
        const caption = this.createText(
          x + CELL_WIDTH / 2,
          y + 214,
          form.caption[lang],
          {
            fontSize: '20px',
            fontStyle: '700',
            color: '#6b5fb3',
            align: 'center',
            wordWrap: { width: CELL_WIDTH - 24, useAdvancedWrap: true },
          },
          false,
        ).setOrigin(0.5);
        parts.push(caption);
      } else {
        const mark = this.createText(x + CELL_WIDTH / 2, y + 82, '?', titleStyle(64), false);
        parts.push(mark.setOrigin(0.5));
      }
      this.panel.content.add(parts);
      this.cells.push({ x, y, tier: form.tier, opened, keycap });
    });
    const rows = Math.ceil(theme.forms.length / COLUMNS);
    return top + rows * CELL_HEIGHT + (rows - 1) * CELL_GAP;
  }

  private achievementRow(def: AchievementDef, earned: boolean, y: number): void {
    const { t, lang } = this.ctx;
    const x = 24;
    const width = 672;
    const hidden = def.secret && !earned;
    const card = new Phaser.GameObjects.Graphics(this);
    card.fillStyle(0xffffff, earned ? 0.92 : 0.5);
    card.fillRoundedRect(x, y, width, ROW_HEIGHT, 30);
    card.lineStyle(3, earned ? 0xffd24a : COLORS.keySide, 1);
    card.strokeRoundedRect(x, y, width, ROW_HEIGHT, 30);
    const medal = new Phaser.GameObjects.Image(this, x + 62, y + ROW_HEIGHT / 2, UI_ART.medal);
    medal.setDisplaySize(76, 76);
    if (!earned) medal.setTintFill(SILHOUETTE).setAlpha(0.45);
    const title = this.createText(
      x + 116,
      y + 38,
      hidden ? t('album.secret') : achievementTitle(def, t, lang),
      { fontSize: '30px', fontStyle: '900', color: COLORS.title },
      false,
    ).setOrigin(0, 0.5);
    const hint = this.createText(
      x + 116,
      y + 80,
      hidden ? t('album.secretHint') : achievementHint(def, t),
      { fontSize: '22px', fontStyle: '700', color: '#6b5fb3' },
      false,
    ).setOrigin(0, 0.5);
    const coin = new Phaser.GameObjects.Image(
      this,
      x + width - 110,
      y + ROW_HEIGHT / 2,
      UI_ART.coin,
    );
    coin.setDisplaySize(36, 36);
    const reward = this.createText(
      x + width - 86,
      y + ROW_HEIGHT / 2,
      `+${formatNumber(def.reward, lang)}`,
      { fontSize: '28px', fontStyle: '900', color: '#b8801f' },
      false,
    ).setOrigin(0, 0.5);
    // Текст не должен заезжать на награду справа.
    const room = width - 116 - 130;
    title.setScale(Math.min(1, room / title.width));
    hint.setScale(Math.min(1, room / hint.width));
    if (!earned) {
      coin.setAlpha(0.5);
      reward.setAlpha(0.5);
    }
    this.panel.content.add([card, medal, title, hint, coin, reward]);
  }

  /** Пасхалка: открытую клавишу в альбоме можно потискать — она сминается и пищит. */
  private tapAt(x: number, y: number): void {
    const cell = this.cells.find(
      (item) => x >= item.x && x <= item.x + CELL_WIDTH && y >= item.y && y <= item.y + CELL_HEIGHT,
    );
    if (!cell?.opened) return;
    cell.keycap.squash(0.9);
    cell.keycap.showFace('squish', 280);
    this.ctx.audio.squish(cell.tier);
  }
}
