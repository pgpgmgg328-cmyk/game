import Phaser from 'phaser';
import { achievementList, type AchievementDef } from '../../core/meta/achievements';
import { albumProgress, isDiscovered } from '../../core/meta/album';
import { selectedWorldIndex } from '../../core/meta/worlds';
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
/** Вкладки: три мира и медали — в один ряд над списком. */
const TAB_GAP = 12;
const TAB_HEIGHT = 110;

/** Вкладка альбома: формы одного мира или достижения. */
type AlbumTab = { kind: 'world'; theme: ThemeData } | { kind: 'medals' };

/** Клетка формы: где лежит (в координатах содержимого) и какая клавиша в ней. */
interface FormCell {
  x: number;
  y: number;
  tier: number;
  opened: boolean;
  keycap: Keycap;
}

/**
 * Альбом (диздок, раздел 6): вкладка на каждый мир — его формы и золотые версии, открытые —
 * цветные, с именем и смешной подписью, неоткрытые — силуэт с «?»; последняя вкладка —
 * достижения, секретные до получения скрыты. На вкладке — процент её коллекции. Клавиши мира
 * рисуются, только когда его вкладку открыли (диздок, раздел 15). Открытую клавишу можно
 * потискать: она сминается и пищит.
 */
export class AlbumScene extends BaseScene {
  private title!: Phaser.GameObjects.Text;
  private progressText!: Phaser.GameObjects.Text;
  private progressBar!: Phaser.GameObjects.Graphics;
  private back!: Button;
  private panel!: ScrollPanel;
  private tabs: { tab: AlbumTab; button: Button; badge: string }[] = [];
  private current = 0;
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
    this.createTabs();
    this.back = new Button(this, 360, 0, {
      id: 'common.back',
      label: t('common.back'),
      width: 400,
      onClick: () => this.scene.start('Menu'),
    });
    this.onKeyAction((action) => {
      if (action === 'pause' || action === 'drop') this.scene.start('Menu');
      // Стрелки листают вкладки.
      else if (action === 'left') this.showTab(this.current - 1);
      else if (action === 'right') this.showTab(this.current + 1);
    });
    this.layoutScreen(this.screenHeight);
    // Сначала открыт мир, выбранный в меню.
    this.showTab(selectedWorldIndex(save.data, WORLD_SIZES), true);
  }

  override update(time: number, delta: number): void {
    this.panel.update(delta);
    this.cells.forEach((cell) => cell.keycap.tick(delta, time));
  }

  protected layoutScreen(height: number): void {
    const compact = height < 1000;
    const titleY = compact ? 54 : Math.min(Math.max(height * 0.06, 60), 120);
    this.title.setFontSize(compact ? 52 : 64).setPosition(360, titleY);
    // На лежащем телефоне общий процент не помещается: проценты остаются на вкладках.
    this.progressText.setVisible(!compact).setPosition(360, titleY + 72);
    const barY = this.progressText.y + 34;
    this.progressBar.setVisible(!compact);
    this.drawProgress(barY);
    // Над вкладкой торчит значок с процентом: оставляем ему место.
    const tabsY = (compact ? titleY + 40 : barY + 10) + 40 + TAB_HEIGHT / 2;
    const tabWidth = this.tabWidth();
    this.tabs.forEach(({ button }, index) => {
      button.setPosition(24 + tabWidth / 2 + index * (tabWidth + TAB_GAP), tabsY);
    });
    this.back.setPosition(360, height - Math.max(24, height * 0.03) - 55);
    const top = tabsY + TAB_HEIGHT / 2 + 14;
    const bottom = this.back.y - 55 - 16;
    this.panel.setArea(0, top, 720, Math.max(100, bottom - top));
  }

  private tabWidth(count = this.tabs.length): number {
    const tabs = Math.max(1, count);
    return (672 - (tabs - 1) * TAB_GAP) / tabs;
  }

  /** Вкладки миров (короткие имена) и медалей; значок — сколько собрано. */
  private createTabs(): void {
    const { t, lang, save } = this.ctx;
    const list: AlbumTab[] = [
      ...THEMES.map((theme): AlbumTab => ({ kind: 'world', theme })),
      { kind: 'medals' },
    ];
    const width = this.tabWidth(list.length);
    this.tabs = list.map((tab, index) => {
      const button = new Button(this, 0, 0, {
        id: tab.kind === 'world' ? `album.tab.${tab.theme.id}` : 'album.tab.medals',
        label: tab.kind === 'world' ? tab.theme.shortName[lang] : t('album.tab.medals'),
        width,
        height: TAB_HEIGHT,
        // Один размер на всех вкладках: длинное имя не должно выглядеть мельче короткого.
        fontSize: 26,
        onClick: () => this.showTab(index),
      });
      let badge: string;
      if (tab.kind === 'world') {
        const world = WORLD_SIZES.find((item) => item.id === tab.theme.id);
        badge = `${albumProgress(save.data.album, world ? [world] : []).percent}%`;
      } else {
        const { earned, total } = this.medalCount();
        badge = `${earned}/${total}`;
      }
      button.setBadge(badge);
      return { tab, button, badge };
    });
  }

  private medalCount(): { earned: number; total: number } {
    const owned = this.ctx.save.data.achievements;
    const list = achievementList(WORLD_SIZES);
    return { earned: list.filter((def) => owned.includes(def.id)).length, total: list.length };
  }

  /** Открыть вкладку: содержимое строится заново, список — с начала. */
  private showTab(index: number, force = false): void {
    const count = this.tabs.length;
    const next = ((index % count) + count) % count;
    if (next === this.current && !force) return;
    this.current = next;
    this.tabs.forEach(({ button }, i) => button.setLatched(i === next));
    this.panel.content.removeAll(true);
    this.cells = [];
    const { tab } = this.tabs[next]!;
    const height = tab.kind === 'world' ? this.buildWorld(tab.theme) : this.buildMedals();
    this.panel.setContentHeight(height);
    this.panel.scrollTo(0);
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

  /** Вкладка мира: имя, сколько собрано, формы и золотые формы. Возвращает высоту. */
  private buildWorld(theme: ThemeData): number {
    const { t, lang, save } = this.ctx;
    const world = WORLD_SIZES.find((item) => item.id === theme.id);
    const progress = albumProgress(save.data.album, world ? [world] : []);
    let y = this.sectionHeader(theme.name[lang], 0);
    y = this.subtitle(t('album.progress', { found: progress.found, total: progress.total }), y);
    const art = ensureThemeArt(this, theme, lang);
    y = this.formGrid(theme, art, false, y);
    y = this.sectionHeader(t('album.golden'), y + SECTION_GAP);
    y = this.formGrid(theme, art, true, y);
    return y + 16;
  }

  /** Вкладка медалей: все достижения; секретные до получения скрыты. Возвращает высоту. */
  private buildMedals(): number {
    const { t, save } = this.ctx;
    const { earned, total } = this.medalCount();
    let y = this.sectionHeader(t('album.achievements'), 0);
    y = this.subtitle(t('album.earned', { found: earned, total }), y);
    const owned = save.data.achievements;
    for (const def of achievementList(WORLD_SIZES)) {
      this.achievementRow(def, owned.includes(def.id), y);
      y += ROW_HEIGHT + 10;
    }
    return y + 6;
  }

  private sectionHeader(text: string, y: number): number {
    const label = this.createText(360, y + HEADER_HEIGHT / 2, text, titleStyle(40), false);
    label.setOrigin(0.5);
    label.setScale(Math.min(1, 660 / label.width));
    this.panel.content.add(label);
    return y + HEADER_HEIGHT;
  }

  /** Строка «сколько собрано» под заголовком вкладки. */
  private subtitle(text: string, y: number): number {
    const label = this.createText(
      360,
      y + 14,
      text,
      { fontSize: '28px', fontStyle: '800', color: '#6b5fb3' },
      false,
    ).setOrigin(0.5);
    this.panel.content.add(label);
    return y + 52;
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

  /**
   * Для автотестов: открытая вкладка, значки вкладок и миры, чьи клавиши уже нарисованы
   * (они рисуются лениво — когда открыли вкладку мира или другой экран с этим миром).
   */
  debugState(): {
    tab: string;
    tabs: { id: string; badge: string; latched: boolean }[];
    drawnWorlds: string[];
    cells: number;
  } {
    const id = (tab: AlbumTab): string => (tab.kind === 'world' ? tab.theme.id : 'medals');
    return {
      tab: id(this.tabs[this.current]!.tab),
      tabs: this.tabs.map(({ tab, button, badge }) => ({
        id: id(tab),
        badge,
        latched: button.isLatched,
      })),
      drawnWorlds: THEMES.filter((theme) =>
        this.textures.exists(`key:${theme.id}:1:${this.ctx.lang}`),
      ).map((theme) => theme.id),
      cells: this.cells.length,
    };
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
