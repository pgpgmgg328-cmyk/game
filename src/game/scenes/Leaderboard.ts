import Phaser from 'phaser';
import { formatNumber } from '../../i18n';
import type { LeaderboardData, LeaderboardRow } from '../../platform';
import { DEFAULT_THEME_ID, THEMES, getTheme } from '../../themes';
import { ensureFormArt, type KeyArt } from '../art/textures';
import { Keycap } from '../objects/Keycap';
import { Button } from '../ui/Button';
import { ScrollPanel } from '../ui/ScrollPanel';
import { COLORS } from '../ui/theme';
import { BaseScene } from './BaseScene';
import { titleStyle } from './titleStyle';

const ROW_WIDTH = 620;
const ROW_HEIGHT = 76;
const ROW_GAP = 10;
/** Цвета мест 1–3: золото, серебро, бронза. */
const MEDALS = [0xffd24a, 0xd9e1f2, 0xf0a868];
/** Картинки строк — маленькие формы мира (Точка … Стрелочка): по числу из id игрока. */
const AVATAR_TIERS = 5;

interface RowView {
  row: LeaderboardRow;
  keycap: Keycap;
}

/**
 * Таблица рекордов (диздок, раздел 10): топ-10 и место игрока. Имён других игроков игра
 * не показывает — это пользовательский текст, а игра для детей (CLAUDE.md, «Контент»):
 * в строке место, весёлая клавиша и счёт. Гостю — кнопка входа с объяснением, зачем он нужен.
 */
export class LeaderboardScene extends BaseScene {
  private title!: Phaser.GameObjects.Text;
  private best!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;
  private panel!: ScrollPanel;
  private signInText: Phaser.GameObjects.Text | null = null;
  private signIn: Button | null = null;
  private back!: Button;
  private arts: KeyArt[] = [];
  private rows: RowView[] = [];
  private busy = false;

  constructor() {
    super('Leaderboard');
  }

  create(): void {
    this.setupScreen();
    const { t, lang, save, platform } = this.ctx;
    this.rows = [];
    this.busy = false;
    const theme = getTheme(DEFAULT_THEME_ID) ?? THEMES[0]!;
    // Клавиши-аватарки — только маленькие формы первого мира.
    this.arts = theme.forms
      .slice(0, AVATAR_TIERS)
      .map((form) => ensureFormArt(this, theme, form, lang));
    this.title = this.createText(360, 0, t('leaderboard.title'), titleStyle(64)).setOrigin(0.5);
    this.best = this.createText(
      360,
      0,
      t('leaderboard.yourBest', { score: formatNumber(save.data.stats.bestScore, lang) }),
      {
        fontSize: '36px',
        fontStyle: '900',
        color: COLORS.title,
        stroke: '#ffffff',
        strokeThickness: 8,
      },
    ).setOrigin(0.5);
    this.status = this.createText(360, 0, t('common.loading'), {
      fontSize: '34px',
      fontStyle: '800',
      color: COLORS.title,
      align: 'center',
      wordWrap: { width: 600, useAdvancedWrap: true },
    }).setOrigin(0.5);
    this.panel = new ScrollPanel(this);
    // Вход — только по кнопке и с объяснением, что он даёт (п. 1.2.1); вошедшим не предлагаем.
    if (platform.canAuthorize) {
      this.signInText = this.createText(360, 0, t('leaderboard.signInText'), {
        fontSize: '28px',
        fontStyle: '800',
        color: COLORS.title,
        align: 'center',
        wordWrap: { width: 620, useAdvancedWrap: true },
      }).setOrigin(0.5);
      this.signIn = new Button(this, 360, 0, {
        id: 'leaderboard.signIn',
        label: t('leaderboard.signIn'),
        width: 400,
        variant: 'primary',
        onClick: () => void this.startSignIn(),
      });
    } else {
      this.signInText = null;
      this.signIn = null;
    }
    this.back = new Button(this, 360, 0, {
      id: 'common.back',
      label: t('common.back'),
      width: 400,
      onClick: () => this.leave(),
    });
    this.onKeyAction((action) => {
      if (action === 'pause' || action === 'drop') this.leave();
    });
    this.layoutScreen(this.screenHeight);
    void this.loadTable();
  }

  override update(time: number, delta: number): void {
    this.panel.update(delta);
    for (const view of this.rows) view.keycap.tick(delta, time);
  }

  protected layoutScreen(height: number): void {
    const compact = height < 1000;
    const titleY = compact ? 54 : Math.min(Math.max(height * 0.06, 60), 120);
    this.title.setFontSize(compact ? 52 : 64).setPosition(360, titleY);
    this.best.setPosition(360, titleY + (compact ? 62 : 80));
    this.back.setPosition(360, height - Math.max(24, height * 0.03) - 55);
    let bottom = this.back.y - 55 - 16;
    if (this.signIn && this.signInText) {
      this.signIn.setPosition(360, bottom - 55);
      this.signInText.setPosition(360, this.signIn.y - 55 - 12 - this.signInText.height / 2);
      bottom = this.signInText.y - this.signInText.height / 2 - 12;
    }
    const top = this.best.y + 40;
    this.panel.setArea(0, top, 720, Math.max(100, bottom - top));
    this.status.setPosition(360, (top + bottom) / 2);
  }

  private leave(): void {
    if (this.busy) return;
    this.scene.start('Menu');
  }

  private async loadTable(): Promise<void> {
    const data = await this.ctx.platform.getLeaderboard();
    if (!this.sys.isActive()) return;
    this.showTable(data);
  }

  private showTable(data: LeaderboardData | null): void {
    const { t } = this.ctx;
    this.rows.forEach((view) => view.keycap.destroy());
    this.rows = [];
    this.panel.content.removeAll(true);
    if (!data) {
      this.status.setText(t('leaderboard.unavailable')).setVisible(true);
      return;
    }
    const shown: (LeaderboardRow | null)[] = [...data.top];
    // Игрок ниже топа: после многоточия — его строка.
    if (data.player && !data.top.some((row) => row.self)) shown.push(null, data.player);
    if (shown.length === 0) {
      this.status.setText(t('leaderboard.empty')).setVisible(true);
      return;
    }
    this.status.setVisible(false);
    let y = 0;
    let selfY: number | null = null;
    for (const row of shown) {
      if (row === null) {
        const dots = this.createText(360, y + 22, '…', titleStyle(44), false).setOrigin(0.5);
        this.panel.content.add(dots);
        y += 50;
        continue;
      }
      if (row.self) selfY = y;
      this.createRow(row, y);
      y += ROW_HEIGHT + ROW_GAP;
    }
    this.panel.setContentHeight(y + 8);
    // Своя строка всегда на виду: если она ниже края, список прокручивается к ней.
    if (selfY !== null) this.panel.reveal(selfY, selfY + ROW_HEIGHT);
  }

  private createRow(row: LeaderboardRow, y: number): void {
    const { t, lang } = this.ctx;
    const left = 360 - ROW_WIDTH / 2;
    const g = new Phaser.GameObjects.Graphics(this);
    g.fillStyle(row.self ? 0xc8f5df : 0xffffff, 0.92);
    g.fillRoundedRect(left, y, ROW_WIDTH, ROW_HEIGHT, ROW_HEIGHT / 2);
    g.lineStyle(3, row.self ? COLORS.mintDark : COLORS.keySide, 1);
    g.strokeRoundedRect(left, y, ROW_WIDTH, ROW_HEIGHT, ROW_HEIGHT / 2);
    const centerY = y + ROW_HEIGHT / 2;
    const medal = MEDALS[row.rank - 1];
    g.fillStyle(medal ?? 0xeef0ff, 1);
    g.fillCircle(left + 44, centerY, 28);
    const rank = this.createText(
      left + 44,
      centerY,
      String(row.rank),
      {
        fontSize: row.rank > 99 ? '22px' : '30px',
        fontStyle: '900',
        color: COLORS.title,
      },
      false,
    ).setOrigin(0.5);
    rank.setScale(Math.min(1, 50 / rank.width));

    const art = this.arts[row.seed % this.arts.length]!;
    const keycap = new Keycap(this, art, { idle: !this.ctx.reducedMotion, random: Math.random });
    keycap.baseScale = Math.min(1, 56 / Math.max(art.width, art.height));
    keycap.setPosition(left + 124, centerY);
    keycap.tick(0, 0);

    const parts: Phaser.GameObjects.GameObject[] = [g, rank, keycap];
    if (row.self) {
      parts.push(
        this.createText(
          left + 176,
          centerY,
          t('leaderboard.you'),
          {
            fontSize: '34px',
            fontStyle: '900',
            color: '#1f4d3a',
          },
          false,
        ).setOrigin(0, 0.5),
      );
    }
    parts.push(
      this.createText(
        left + ROW_WIDTH - 32,
        centerY,
        formatNumber(row.score, lang),
        {
          fontSize: '36px',
          fontStyle: '900',
          color: COLORS.title,
        },
        false,
      ).setOrigin(1, 0.5),
    );
    this.panel.content.add(parts);
    this.rows.push({ row, keycap });
  }

  /** Состояние экрана для автотестов: надпись, строки таблицы и есть ли кнопка входа. */
  debugState(): {
    status: string | null;
    best: string;
    rows: { rank: number; score: number; self: boolean }[];
    signIn: boolean;
  } {
    return {
      status: this.status.visible ? this.status.text : null,
      best: this.best.text,
      rows: this.rows.map(({ row }) => ({ rank: row.rank, score: row.score, self: row.self })),
      signIn: this.signIn !== null,
    };
  }

  /** «Войти»: окно Яндекс ID, затем прогресс аккаунта, рекорд в таблицу и свежая таблица. */
  private async startSignIn(): Promise<void> {
    if (this.busy || !this.signIn) return;
    this.busy = true;
    this.signIn.setDisabled(true);
    this.back.setDisabled(true);
    await this.ctx.signIn();
    if (!this.sys.isActive()) return;
    this.busy = false;
    // Экран заново: вошедшему кнопка входа больше не нужна, рекорд и таблица — уже его.
    this.scene.restart();
  }
}
