import Phaser from 'phaser';
import { albumProgress } from '../../core/meta/album';
import { applyRunOutcome } from '../../core/meta/progress';
import type { RunSnapshot } from '../../core/run/snapshot';
import { formatNumber, type TranslationKey } from '../../i18n';
import { WORLD_SIZES } from '../../themes';
import { Button } from '../ui/Button';
import { COLORS } from '../ui/theme';
import { BaseScene } from './BaseScene';
import { titleStyle } from './titleStyle';

const MENU_ITEMS: readonly { key: TranslationKey; scene: string }[] = [
  { key: 'menu.worlds', scene: 'Worlds' },
  { key: 'menu.album', scene: 'Album' },
  { key: 'menu.upgrades', scene: 'Upgrades' },
  { key: 'menu.shop', scene: 'Shop' },
  { key: 'menu.leaderboard', scene: 'Leaderboard' },
  { key: 'menu.settings', scene: 'Settings' },
];

/** На низком экране (телефон в альбомной ориентации) кнопки встают в три колонки вместо двух. */
const COMPACT_HEIGHT = 1000;

/** Окно «Продолжить забег?» после перезагрузки страницы посреди забега. */
interface ResumeDialog {
  snapshot: RunSnapshot;
  shade: Phaser.GameObjects.Rectangle;
  panel: Phaser.GameObjects.Graphics;
  title: Phaser.GameObjects.Text;
  score: Phaser.GameObjects.Text;
  yes: Button;
  no: Button;
}

export class MenuScene extends BaseScene {
  private title!: Phaser.GameObjects.Text;
  private play!: Button;
  private items: Button[] = [];
  private resume: ResumeDialog | null = null;

  constructor() {
    super('Menu');
  }

  create(): void {
    this.setupScreen();
    const { t } = this.ctx;
    // Название в две строки: «Сквиши Клавиши:» и «Мерж до Пробела».
    this.title = this.createText(360, 0, t('game.title').replace(': ', ':\n'), titleStyle(60))
      .setOrigin(0.5, 0)
      .setLineSpacing(-8);
    this.play = new Button(this, 360, 0, {
      id: 'menu.play',
      label: t('menu.play'),
      width: 480,
      height: 170,
      variant: 'primary',
      fontSize: 76,
      onClick: () => this.startGame(),
    });
    this.items = MENU_ITEMS.map(
      (item) =>
        new Button(this, 0, 0, {
          id: item.key,
          label: t(item.key),
          width: 320,
          height: 120,
          fontSize: 40,
          onClick: () => this.scene.start(item.scene),
        }),
    );
    // Процент коллекции виден прямо на кнопке «Альбом» (диздок, раздел 6).
    const album = albumProgress(this.ctx.save.data.album, WORLD_SIZES);
    this.items.find((item) => item.id === 'menu.album')?.setBadge(`${album.percent}%`);
    this.resume = null;
    this.onKeyAction((action) => {
      if (this.resume) {
        if (action === 'drop') this.answerResume(true);
        if (action === 'pause') this.answerResume(false);
        return;
      }
      if (action === 'drop') this.startGame();
    });
    this.layoutScreen(this.screenHeight);

    if (!this.ctx.reducedMotion) {
      this.tweens.add({
        targets: this.play,
        scale: 1.05,
        duration: 650,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    if (this.ctx.pendingRun) this.openResume(this.ctx.pendingRun);

    // LoadingAPI.ready(): меню нарисовано и принимает ввод (п. 1.19.2). Повторные вызовы игнорируются.
    this.game.events.once(Phaser.Core.Events.POST_RENDER, () => this.ctx.platform.ready());
  }

  protected layoutScreen(height: number): void {
    const compact = height < COMPACT_HEIGHT;
    this.title.setFontSize(compact ? 48 : 60);
    this.title.setStroke(titleStyle(compact ? 48 : 60).stroke ?? '', compact ? 10 : 12);
    this.title.setY(Math.min(Math.max(height * 0.05, 24), 90));

    const titleBottom = this.title.y + this.title.height;
    const playHeight = compact ? 150 : 170;
    this.play.setButtonSize(compact ? 420 : 480, playHeight);

    const columns = compact ? 3 : 2;
    const rows = Math.ceil(this.items.length / columns);
    const itemWidth = compact ? 212 : 320;
    const itemHeight = compact ? 116 : 124;
    const gap = compact ? 16 : 24;
    const gridHeight = rows * itemHeight + (rows - 1) * gap;

    // Свободное место делим между отступами, чтобы на высоком экране меню не липло к верху.
    const free = Math.max(0, height - titleBottom - playHeight - gridHeight - 40);
    const playY = titleBottom + Math.max(gap, free * 0.3) + playHeight / 2;
    const gridTop = playY + playHeight / 2 + Math.max(gap * 1.5, free * 0.2);
    this.play.setPosition(360, playY);

    const rowWidth = columns * itemWidth + (columns - 1) * gap;
    this.items.forEach((item, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      item.setButtonSize(itemWidth, itemHeight);
      item.setPosition(
        360 - rowWidth / 2 + itemWidth / 2 + column * (itemWidth + gap),
        gridTop + itemHeight / 2 + row * (itemHeight + gap),
      );
    });
    this.layoutResume(height);
  }

  private startGame(): void {
    this.scene.start('Game');
  }

  /** «Продолжить забег?» — после перезагрузки страницы посреди забега (CLAUDE.md, «Сохранения»). */
  private openResume(snapshot: RunSnapshot): void {
    const { t, lang } = this.ctx;
    // Затемнение ловит нажатия, чтобы они не проходили к меню.
    const shade = this.add.rectangle(0, 0, 720, 100, COLORS.dim, 0.45).setOrigin(0, 0);
    shade.setInteractive();
    const panel = this.add.graphics();
    const title = this.createText(360, 0, t('resume.title'), titleStyle(46)).setOrigin(0.5);
    const score = this.createText(
      360,
      0,
      t('resume.score', { score: formatNumber(snapshot.score, lang) }),
      { fontSize: '38px', fontStyle: '800', color: COLORS.title },
    ).setOrigin(0.5);
    const yes = new Button(this, 360, 0, {
      id: 'resume.yes',
      label: t('resume.yes'),
      width: 420,
      variant: 'primary',
      onClick: () => this.answerResume(true),
    });
    const no = new Button(this, 360, 0, {
      id: 'resume.no',
      label: t('resume.no'),
      width: 420,
      onClick: () => this.answerResume(false),
    });
    this.resume = { snapshot, shade, panel, title, score, yes, no };
    this.setMenuEnabled(false);
    this.layoutScreen(this.screenHeight);
  }

  private answerResume(accept: boolean): void {
    const dialog = this.resume;
    if (!dialog) return;
    this.resume = null;
    this.ctx.pendingRun = null;
    for (const item of [
      dialog.shade,
      dialog.panel,
      dialog.title,
      dialog.score,
      dialog.yes,
      dialog.no,
    ]) {
      item.destroy();
    }
    if (accept) {
      this.scene.start('Game', { snapshot: dialog.snapshot });
      return;
    }
    // Забег не продолжаем, но его счёт мог быть рекордом.
    const { ctx } = this;
    ctx.platform.saveRunSnapshot(null);
    const { snapshot } = dialog;
    ctx.save.update((draft) => {
      applyRunOutcome(draft, {
        score: snapshot.score,
        completed: false,
        merges: snapshot.merges,
        goldenMerges: snapshot.goldenMerges,
        megas: snapshot.megas,
        coins: snapshot.coins,
      });
    });
    this.setMenuEnabled(true);
  }

  private setMenuEnabled(enabled: boolean): void {
    for (const button of [this.play, ...this.items]) {
      if (enabled) button.setInteractive();
      else button.disableInteractive();
    }
  }

  private layoutResume(height: number): void {
    const dialog = this.resume;
    if (!dialog) return;
    const { canvasWidth, canvasHeight, column, scale } = this.ctx.layout;
    const shadeWidth = canvasWidth / scale;
    const shadeHeight = canvasHeight / scale;
    dialog.shade.setPosition(-column.x / scale, -column.y / scale);
    dialog.shade.setSize(shadeWidth, shadeHeight);
    if (dialog.shade.input) dialog.shade.input.hitArea.setSize(shadeWidth, shadeHeight);

    const gap = height < COMPACT_HEIGHT ? 14 : 24;
    const contentHeight = 110 + 64 + gap + 110 + gap + 110;
    const top = Math.max(24, (height - contentHeight) / 2);
    dialog.panel.clear();
    dialog.panel.fillStyle(COLORS.panel, 0.95);
    dialog.panel.fillRoundedRect(60, top - 28, 600, contentHeight + 56, 40);
    dialog.title.setPosition(360, top + 50);
    dialog.score.setPosition(360, top + 110 + 20);
    dialog.yes.setPosition(360, top + 110 + 64 + gap + 55);
    dialog.no.setPosition(360, dialog.yes.y + 110 + gap);
  }
}
