import Phaser from 'phaser';
import { grantAchievements, type SecretAchievement } from '../../core/meta/achievements';
import { albumProgress } from '../../core/meta/album';
import { canClaimGift } from '../../core/meta/daily';
import { shouldOfferShortcut } from '../../core/meta/prompts';
import { isWorldUnlocked, selectedWorldIndex } from '../../core/meta/worlds';
import { SecretWordTracker } from '../../core/menu/easterEggs';
import type { RunSnapshot } from '../../core/run/snapshot';
import { formatNumber, type TranslationKey } from '../../i18n';
import { THEMES, WORLD_SIZES, formOf, type ThemeData } from '../../themes';
import { achievementTitle } from '../achievementText';
import { UI_ART, ensureFxArt, ensureThemeArt, ensureUiArt, type KeyArt } from '../art/textures';
import { keycapRain } from '../objects/KeycapRain';
import { Mascots, SLEEP_AFTER_MS } from '../objects/Mascots';
import { MenuLogo } from '../objects/MenuLogo';
import { Particles } from '../objects/Particles';
import { Toasts } from '../objects/Toasts';
import { Button, type ButtonIcon } from '../ui/Button';
import { COLORS } from '../ui/theme';
import type { BackgroundScene } from './Background';
import { BaseScene } from './BaseScene';
import { titleStyle } from './titleStyle';

/** Миры листаются каруселью над «ИГРАТЬ», поэтому в сетке вместо «Миров» — «Задания». */
const MENU_ITEMS: readonly { key: TranslationKey; scene: string; icon: ButtonIcon }[] = [
  { key: 'menu.daily', scene: 'Daily', icon: 'gift' },
  { key: 'menu.album', scene: 'Album', icon: 'album' },
  { key: 'menu.upgrades', scene: 'Upgrades', icon: 'upgrades' },
  { key: 'menu.shop', scene: 'Shop', icon: 'shop' },
  { key: 'menu.leaderboard', scene: 'Leaderboard', icon: 'leaderboard' },
  { key: 'menu.settings', scene: 'Settings', icon: 'settings' },
];

/** Сколько места нужно сбоку от колонки, чтобы посадить туда персонажей. */
const SIDE_MASCOTS_ROOM = 200;

/** На низком экране (телефон в альбомной ориентации) кнопки встают в три колонки вместо двух. */
const COMPACT_HEIGHT = 1000;
/** Карусель миров: стрелки по бокам и кнопка с именем мира посередине. */
const CAROUSEL_HEIGHT = 110;
const ARROW_WIDTH = 110;

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
  private logo!: MenuLogo;
  private play!: Button;
  /** Карусель миров (диздок, раздел 9): ◀ мир ▶. Имя мира — кнопка на экран «Миры». */
  private worldPrev!: Button;
  private worldName!: Button;
  private worldNext!: Button;
  private worldIndex = 0;
  private items: Button[] = [];
  private coinPanel!: Phaser.GameObjects.Graphics;
  private coinIcon!: Phaser.GameObjects.Image;
  private coinText!: Phaser.GameObjects.Text;
  private mascots!: Mascots;
  private toasts!: Toasts;
  private fx!: Particles;
  private theme!: ThemeData;
  private arts: KeyArt[] = [];
  private resume: ResumeDialog | null = null;
  /** «На рабочий стол»: появляется после пятого забега, если площадка разрешает ярлык. */
  private shortcut: Button | null = null;
  private secretWord = new SecretWordTracker();
  private idleMs = 0;

  constructor() {
    super('Menu');
  }

  create(): void {
    this.setupScreen();
    const { t, lang, save } = this.ctx;
    // Новый день — новое задание и подарок (дни — по серверному времени).
    const today = this.ctx.rollDaily();
    this.secretWord = new SecretWordTracker();
    this.idleMs = 0;
    this.worldIndex = selectedWorldIndex(save.data, WORLD_SIZES);
    this.theme = THEMES[this.worldIndex]!;
    this.applyWorldLook();
    ensureFxArt(this);
    ensureUiArt(this);
    this.arts = ensureThemeArt(this, this.theme, lang);

    this.coinPanel = this.add.graphics();
    this.coinIcon = this.add.image(0, 0, UI_ART.coin).setDisplaySize(44, 44);
    this.coinText = this.createText(0, 0, formatNumber(save.data.coins, lang), {
      fontSize: '34px',
      fontStyle: '900',
      color: COLORS.title,
    }).setOrigin(0, 0.5);
    // Название игры из клавиш-букв: по ним можно сыграть мелодию (пасхалка «Пианист»).
    this.logo = new MenuLogo(this, t('game.title'), this.ctx.reducedMotion, {
      onNote: (freq) => this.ctx.audio.note(freq),
      onMelody: () => this.secret('pianist'),
    });
    this.play = new Button(this, 360, 0, {
      id: 'menu.play',
      label: t('menu.play'),
      icon: 'play',
      width: 480,
      height: 170,
      variant: 'primary',
      fontSize: 76,
      onClick: () => this.startGame(),
    });
    this.worldPrev = new Button(this, 0, 0, {
      id: 'menu.prevWorld',
      icon: 'left',
      width: ARROW_WIDTH,
      height: CAROUSEL_HEIGHT,
      onClick: () => this.switchWorld(-1),
    });
    this.worldName = new Button(this, 0, 0, {
      id: 'menu.world',
      label: '',
      icon: 'worlds',
      width: 420,
      height: CAROUSEL_HEIGHT,
      fontSize: 40,
      onClick: () => this.openWorlds(),
    });
    this.worldNext = new Button(this, 0, 0, {
      id: 'menu.nextWorld',
      icon: 'right',
      width: ARROW_WIDTH,
      height: CAROUSEL_HEIGHT,
      onClick: () => this.switchWorld(1),
    });
    this.updateWorldButtons();
    this.items = MENU_ITEMS.map(
      (item) =>
        new Button(this, 0, 0, {
          id: item.key,
          label: t(item.key),
          icon: item.icon,
          width: 320,
          height: 120,
          fontSize: 38,
          onClick: () => this.scene.start(item.scene),
        }),
    );
    this.mascots = new Mascots(this, this.mascotArts(), this.ctx.reducedMotion, (tier) =>
      this.ctx.audio.squish(tier),
    );
    this.fx = new Particles(this, this.ctx.reducedMotion);
    this.add.existing(this.fx.layer);
    this.toasts = new Toasts(this, this.ctx.reducedMotion);
    this.bindEasterEggs();
    // Процент коллекции виден прямо на кнопке «Альбом» (диздок, раздел 6).
    const album = albumProgress(this.ctx.save.data.album, WORLD_SIZES);
    this.items.find((item) => item.id === 'menu.album')?.setBadge(`${album.percent}%`);
    // Подарок дня ждёт — на «Заданиях» значок «!».
    if (canClaimGift(save.data, today, 'free')) {
      this.items.find((item) => item.id === 'menu.daily')?.setBadge('!');
    }
    this.resume = null;
    this.shortcut = null;
    this.offerShortcut();
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
    // Стики-баннер — после этого и только без покупки «Без рекламы».
    this.game.events.once(Phaser.Core.Events.POST_RENDER, () => {
      this.ctx.platform.ready();
      this.ctx.syncBanner();
    });
  }

  override update(time: number, delta: number): void {
    this.logo.tick(time);
    this.mascots.tick(delta, time);
    this.toasts.tick(delta, time);
    // Пасхалка: если долго ничего не трогать, персонажи засыпают.
    this.idleMs += delta;
    if (this.idleMs >= SLEEP_AFTER_MS && !this.resume) this.mascots.sleep();
  }

  protected layoutScreen(height: number): void {
    const compact = height < COMPACT_HEIGHT;
    const { canvasWidth, column, scale } = this.ctx.layout;
    const visibleLeft = -column.x / scale;
    const visibleRight = visibleLeft + canvasWidth / scale;
    const sideRoom = Math.min(-visibleLeft, visibleRight - 720);

    // Монеты: в левом верхнем углу, а если сбоку есть место — на боковой панели.
    const coinsInSide = compact && sideRoom >= SIDE_MASCOTS_ROOM;
    this.placeCoins(coinsInSide ? visibleLeft / 2 : null, coinsInSide ? 60 : 54);
    // Кнопка «На рабочий стол» сверху справа: название игры опускается под неё.
    const shortcutAbove = this.shortcut !== null && !coinsInSide;
    const logoTop = Math.max(
      shortcutAbove ? 124 : 0,
      compact ? (coinsInSide ? 20 : 100) : Math.min(Math.max(height * 0.07, 104), 150),
    );
    const titleBottom = this.logo.layout(logoTop, compact);
    const playHeight = compact ? 150 : 170;
    this.play.setButtonSize(compact ? 420 : 480, playHeight);

    const columns = compact ? 3 : 2;
    const rows = Math.ceil(this.items.length / columns);
    const itemWidth = compact ? 212 : 320;
    const itemHeight = compact ? 116 : 124;
    const gap = compact ? 16 : 24;
    const gridHeight = rows * itemHeight + (rows - 1) * gap;

    // Свободное место делим между отступами, чтобы на высоком экране меню не липло к верху.
    const free = Math.max(
      0,
      height - titleBottom - CAROUSEL_HEIGHT - playHeight - gridHeight - 40 - gap,
    );
    const carouselY = titleBottom + Math.max(gap, free * 0.25) + CAROUSEL_HEIGHT / 2;
    const playY = carouselY + CAROUSEL_HEIGHT / 2 + Math.max(gap, free * 0.1) + playHeight / 2;
    const gridTop = playY + playHeight / 2 + Math.max(gap * 1.5, free * 0.2);
    this.play.setPosition(360, playY);
    this.placeCarousel(carouselY, compact);

    const rowWidth = columns * itemWidth + (columns - 1) * gap;
    this.items.forEach((item, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      item.setButtonSize(itemWidth, itemHeight);
      item.setPosition(
        360 - rowWidth / 2 + itemWidth / 2 + col * (itemWidth + gap),
        gridTop + itemHeight / 2 + row * (itemHeight + gap),
      );
    });
    this.layoutMascots(height, gridTop + gridHeight, sideRoom, visibleLeft, visibleRight);
    this.placeShortcut(coinsInSide, visibleRight);
    this.toasts.setAnchor(360, height - 80, 680);
    this.layoutResume(height);
  }

  /** Персонажи: по бокам, если там есть место, иначе внизу под кнопками, если помещаются. */
  private layoutMascots(
    height: number,
    gridBottom: number,
    sideRoom: number,
    visibleLeft: number,
    visibleRight: number,
  ): void {
    const ground = height - 24;
    if (sideRoom >= SIDE_MASCOTS_ROOM) {
      const size = Math.min(150, sideRoom * 0.32);
      const left = visibleLeft / 2;
      const right = (720 + visibleRight) / 2;
      const spread = Math.min(sideRoom * 0.24, 110);
      this.mascots.layout(
        [
          { x: left - spread, y: ground },
          { x: right + spread, y: ground },
          { x: left + spread, y: ground },
          { x: right - spread, y: ground },
        ],
        spread * 2 - 16,
        size,
      );
      return;
    }
    const free = ground - gridBottom - 24;
    if (free < 110) {
      this.mascots.layout([], 0, 0);
      return;
    }
    const count = this.mascots.count;
    const step = 660 / count;
    this.mascots.layout(
      Array.from({ length: count }, (_, index) => ({ x: 30 + step * (index + 0.5), y: ground })),
      step - 18,
      Math.min(130, free - 20),
    );
  }

  private placeCoins(sideX: number | null, y: number): void {
    const width = 44 + 10 + this.coinText.width + 36;
    const x = sideX === null ? 24 : sideX - width / 2;
    const g = this.coinPanel;
    g.clear();
    g.fillStyle(0xffffff, 0.85);
    g.fillRoundedRect(x, y - 30, width, 60, 30);
    g.lineStyle(3, 0xffd24a, 1);
    g.strokeRoundedRect(x, y - 30, width, 60, 30);
    this.coinIcon.setPosition(x + 18 + 22, y);
    this.coinText.setPosition(x + 18 + 44 + 10, y);
  }

  /**
   * Открытые формы мира, от больших к маленьким. Первые три клавиши новый игрок видит сразу,
   * поэтому они есть всегда; неоткрытые формы в меню не появляются — их тайна для альбома.
   */
  private openedArts(): KeyArt[] {
    const opened = this.ctx.save.data.album[this.theme.id]?.forms ?? [];
    const tiers = new Set([1, 2, 3, ...opened.filter((tier) => tier <= this.arts.length)]);
    return [...tiers].sort((a, b) => b - a).map((tier) => this.arts[tier - 1]!);
  }

  /** Персонажи меню: самые большие открытые формы. */
  private mascotArts(): KeyArt[] {
    return this.openedArts().slice(0, 4);
  }

  // ── Карусель миров ───────────────────────────────────────────────────────────────────

  private placeCarousel(y: number, compact: boolean): void {
    const nameWidth = compact ? 400 : 420;
    const gap = 16;
    this.worldName.setButtonSize(nameWidth, CAROUSEL_HEIGHT).setPosition(360, y);
    const offset = nameWidth / 2 + gap + ARROW_WIDTH / 2;
    this.worldPrev.setPosition(360 - offset, y);
    this.worldNext.setPosition(360 + offset, y);
  }

  private get worldUnlocked(): boolean {
    return isWorldUnlocked(this.ctx.save.data, WORLD_SIZES, this.worldIndex);
  }

  /** Фон и музыка выбранного мира. */
  private applyWorldLook(): void {
    (this.scene.get('Background') as BackgroundScene | null)?.setTheme(this.theme);
    this.ctx.audio.setMusic(this.theme.music);
  }

  /** Имя мира на кнопке карусели и «ИГРАТЬ» или «ОТКРЫТЬ» для закрытого мира. */
  private updateWorldButtons(): void {
    const { t, lang } = this.ctx;
    const unlocked = this.worldUnlocked;
    this.worldName.setText(this.theme.name[lang]).setIcon(unlocked ? 'worlds' : 'lock');
    this.play
      .setText(t(unlocked ? 'menu.play' : 'menu.unlock'))
      .setIcon(unlocked ? 'play' : 'lock');
  }

  /** Листать миры стрелками: сразу меняются фон, музыка и персонажи меню. */
  private switchWorld(step: number): void {
    if (this.resume) return;
    const count = THEMES.length;
    this.worldIndex = (this.worldIndex + step + count) % count;
    this.theme = THEMES[this.worldIndex]!;
    const id = this.theme.id;
    this.ctx.save.update((draft) => {
      draft.worlds.selected = id;
    });
    this.applyWorldLook();
    this.arts = ensureThemeArt(this, this.theme, this.ctx.lang);
    this.mascots.destroy();
    this.mascots = new Mascots(this, this.mascotArts(), this.ctx.reducedMotion, (tier) =>
      this.ctx.audio.squish(tier),
    );
    this.updateWorldButtons();
    this.layoutScreen(this.screenHeight);
    // Мир «здоровается» своим голосом — звуком слияния средней клавиши, сразу после щелчка кнопки.
    const voice = formOf(this.theme, 3).sound;
    this.time.delayedCall(120, () => this.ctx.audio.form(voice, 0));
    if (!this.ctx.reducedMotion) {
      this.worldName.setScale(0.9);
      this.tweens.add({ targets: this.worldName, scale: 1, duration: 220, ease: 'Back.easeOut' });
    }
  }

  private openWorlds(): void {
    this.scene.start('Worlds', { focus: this.theme.id });
  }

  // ── Ярлык на рабочий стол ────────────────────────────────────────────────────────────

  /** Кнопка-предложение после пятого забега (диздок, раздел 9) — только если площадка разрешает. */
  private offerShortcut(): void {
    const { ctx } = this;
    if (!shouldOfferShortcut(ctx.save.data)) return;
    void ctx.platform.canAddShortcut().then((canShow) => {
      if (!canShow || !this.sys.isActive() || this.shortcut) return;
      this.shortcut = new Button(this, 0, 0, {
        id: 'menu.shortcut',
        label: ctx.t('menu.shortcut'),
        icon: 'shortcut',
        width: 330,
        height: 110,
        fontSize: 32,
        onClick: () => void this.addShortcut(),
      });
      if (this.resume) this.shortcut.disableInteractive();
      this.layoutScreen(this.screenHeight);
    });
  }

  /** Сверху справа, а на лежащем телефоне — на правой боковой панели. */
  private placeShortcut(inSide: boolean, visibleRight: number): void {
    const button = this.shortcut;
    if (!button) return;
    if (inSide) {
      const room = visibleRight - 720 - 24;
      button.setButtonSize(Math.min(330, room), 110);
      button.setPosition((720 + visibleRight) / 2, 66);
      return;
    }
    button.setButtonSize(330, 110);
    button.setPosition(720 - 24 - 165, 58);
  }

  private async addShortcut(): Promise<void> {
    const { ctx } = this;
    const button = this.shortcut;
    if (!button) return;
    button.setDisabled(true);
    const accepted = await ctx.platform.addShortcut();
    if (!this.sys.isActive()) return;
    if (!accepted) {
      button.setDisabled(false);
      return;
    }
    ctx.save.update((draft) => {
      draft.prompts.shortcut = true;
    });
    button.destroy();
    this.shortcut = null;
    this.toasts.show({
      icon: { kind: 'medal' },
      title: ctx.t('menu.shortcutDone.title'),
      detail: ctx.t('menu.shortcutDone.text'),
    });
  }

  // ── Пасхалки ─────────────────────────────────────────────────────────────────────────

  private bindEasterEggs(): void {
    const wake = (): void => {
      this.idleMs = 0;
      this.mascots.wake();
    };
    this.input.on(Phaser.Input.Events.POINTER_DOWN, wake);
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!this.sys.isActive()) return;
      wake();
      if (this.resume || event.repeat) return;
      // Стрелки листают миры. A и D здесь не листают: они нужны для тайного слова.
      if (event.code === 'ArrowLeft') this.switchWorld(-1);
      if (event.code === 'ArrowRight') this.switchWorld(1);
      // Пасхалка: «КЛАЦ» или «CLACK» на клавиатуре (по event.code, раскладка не важна).
      if (this.secretWord.press(event.code)) this.secret('secret_word');
    };
    window.addEventListener('keydown', onKeyDown);
    this.addCleanup(() => window.removeEventListener('keydown', onKeyDown));
  }

  /** Сработала пасхалка: праздник на экране и секретное достижение (один раз). */
  private secret(id: SecretAchievement): void {
    const { ctx } = this;
    if (id === 'pianist') {
      this.logo.cheer();
      this.fx.celebrate(360, 160);
      ctx.audio.record();
    } else {
      const { canvasWidth, canvasHeight, column, scale } = ctx.layout;
      keycapRain(this, this.openedArts(), {
        x: -column.x / scale,
        y: -column.y / scale,
        width: canvasWidth / scale,
        height: canvasHeight / scale,
      });
      ctx.audio.rain();
    }
    let granted: ReturnType<typeof grantAchievements> = [];
    ctx.save.update((draft) => {
      granted = grantAchievements(draft, [id], WORLD_SIZES);
    });
    for (const def of granted) {
      this.toasts.show({
        icon: { kind: 'medal' },
        title: ctx.t('game.achievement'),
        detail: achievementTitle(def, ctx.t, ctx.lang),
        coins: def.reward,
      });
      ctx.audio.achievement();
    }
    if (granted.length > 0) {
      this.coinText.setText(formatNumber(ctx.save.data.coins, ctx.lang));
      this.layoutScreen(this.screenHeight);
    }
  }

  // ── Для автотестов ───────────────────────────────────────────────────────────────────

  debugState(): {
    coins: string;
    mascots: number;
    asleep: boolean;
    logoFirstRow: number;
    world: string;
    locked: boolean;
  } {
    return {
      coins: this.coinText.text,
      mascots: this.mascots.count,
      asleep: this.mascots.asleep,
      logoFirstRow: this.logo.firstRowLength,
      world: this.theme.id,
      locked: !this.worldUnlocked,
    };
  }

  debugPressLogo(row: number, index: number): void {
    this.logo.press(row, index);
  }

  /** Промотать бездействие (для проверки засыпающих персонажей). */
  debugIdle(ms: number): void {
    this.idleMs += ms;
  }

  /** «ИГРАТЬ» — забег в выбранном мире; закрытый мир — экран «Миры», где его можно открыть. */
  private startGame(): void {
    if (!this.worldUnlocked) {
      this.openWorlds();
      return;
    }
    this.scene.start('Game', { world: this.theme.id });
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
    ctx.recordRun({
      score: snapshot.score,
      completed: false,
      merges: snapshot.merges,
      goldenMerges: snapshot.goldenMerges,
      megas: snapshot.megas,
      coins: snapshot.coins,
    });
    this.setMenuEnabled(true);
  }

  private setMenuEnabled(enabled: boolean): void {
    const carousel = [this.worldPrev, this.worldName, this.worldNext];
    const shortcut = this.shortcut ? [this.shortcut] : [];
    for (const button of [this.play, ...carousel, ...this.items, ...shortcut]) {
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
