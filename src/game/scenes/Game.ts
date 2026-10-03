import Phaser from 'phaser';
import { ADS, DROP, JAR, NEW_FORM, RUN, SPAWN, SQUISH, TUTORIAL } from '../../config/balance';
import { actionForKey } from '../../core/input';
import type { BotView } from '../../core/run/bot';
import {
  earnedAchievements,
  grantAchievements,
  type AchievementDef,
} from '../../core/meta/achievements';
import { discoverForm, isDiscovered } from '../../core/meta/album';
import { runModifiers } from '../../core/meta/upgrades';
import type { RunSnapshot } from '../../core/run/snapshot';
import {
  DEFAULT_THEME_ID,
  THEMES,
  WORLD_SIZES,
  formOf,
  getTheme,
  maxTier,
  type ThemeData,
} from '../../themes';
import { achievementTitle } from '../achievementText';
import { hexToNumber } from '../art/color';
import { caramelTexture } from '../art/specialArt';
import { ensureFxArt, ensureThemeArt, ensureUiArt, goldenArt, type KeyArt } from '../art/textures';
import { e2eSeed } from '../e2eParams';
import { CoinFlights } from '../objects/CoinFlights';
import { DangerLine } from '../objects/DangerLine';
import { FormReveal, type RevealKind } from '../objects/FormReveal';
import { AimGuide, JarView } from '../objects/Jar';
import { Keycap } from '../objects/Keycap';
import { MeteorView } from '../objects/Meteor';
import { Particles } from '../objects/Particles';
import {
  HUD_SIDE_ROOM,
  HUD_TOOLS_HEIGHT,
  HUD_TOP_HEIGHT,
  RunHud,
  type HudPreview,
  type HudTools,
} from '../objects/RunHud';
import { Toasts } from '../objects/Toasts';
import { TutorialHand, type HintKind } from '../objects/TutorialHand';
import { phaserMatter } from '../run/phaserMatter';
import { Run, type RunEvent, type RunKey, type RunMeteor, type ToolId } from '../run/Run';
import type { BackgroundScene } from './Background';
import { BaseScene } from './BaseScene';
import type { OfferData } from './Offer';
import { titleStyle } from './titleStyle';

export interface GameSceneData {
  /** Продолжить сохранённый забег. */
  snapshot?: RunSnapshot;
  /** Мир забега; по умолчанию — выбранный в карусели меню. */
  world?: string;
  /** Пробный забег в закрытом мире за рекламу (диздок, раздел 5). */
  trial?: boolean;
}

/** Форма, открытая в забеге. golden — открылась золотая версия. */
export interface FoundForm {
  tier: number;
  golden: boolean;
}

/** Что показать на экране результата. */
export interface RunSummary {
  score: number;
  best: number;
  newRecord: boolean;
  bestTier: number;
  world: string;
  /** Все монеты забега: за слияния и бонус за очки. */
  coins: number;
  /** Бонус в конце забега (очки / 100). */
  bonus: number;
  /** Формы, открытые в этом забеге. */
  newForms: FoundForm[];
  /** Достижения, полученные в этом забеге. */
  achievements: string[];
}

/** Самая высокая клавиша, которая может висеть над банкой (тир 5), в единицах физики. */
const MAX_HANG_HEIGHT = 100;
/** Сколько длится надпись «Банка переполнена!» перед экраном результата. */
const OVERFLOW_BANNER_MS = 1700;
/** Удары о соседей анимируются не чаще, чем раз в столько миллисекунд на клавишу. */
const IMPACT_COOLDOWN_MS = 140;
/** Сколько висит наклейка «Новая!» над только что открытой клавишей. */
const STICKER_MS = 1600;
/** Сколько клавиши радуются появлению Пробела. */
const CHEER_MS = 1600;
/** Искорки из хвоста летящего «Метеорчика» — не чаще раза в столько миллисекунд. */
const TRAIL_MS = 70;

interface Gesture {
  pointerId: number;
  /** aim — ведём прицел; squish — тапнули клавишу; tool — нажатие ушло на инструмент. */
  kind: 'aim' | 'squish' | 'tool';
}

interface Sticker {
  keyId: number;
  label: Phaser.GameObjects.Text;
  until: number;
}

/**
 * Экран забега: банка с клавишами, прицел, счёт, монеты и инструменты. Физика и правила живут
 * в Run (game/run), сцена рисует их состояние, передаёт ввод и отвечает анимациями.
 * Пока экран открыт, забег активен: площадке уходит GameplayAPI.start(), на паузе — stop().
 */
export class GameScene extends BaseScene {
  private run!: Run;
  private theme!: ThemeData;
  private art: KeyArt[] = [];
  private goldArt = new Map<number, KeyArt>();
  private jarRoot!: Phaser.GameObjects.Container;
  private keysLayer!: Phaser.GameObjects.Container;
  private stickerLayer!: Phaser.GameObjects.Container;
  private views = new Map<number, Keycap>();
  private lastImpact = new Map<number, number>();
  private hanging: Keycap | MeteorView | null = null;
  /** «Метеорчик» в полёте (мир 3). */
  private meteorView: MeteorView | null = null;
  private trailMs = 0;
  private danger!: DangerLine;
  private guide!: AimGuide;
  private fx!: Particles;
  private hud!: RunHud;
  private coinFlights!: CoinFlights;
  private toasts!: Toasts;
  private reveal!: FormReveal;
  private removeHint!: Phaser.GameObjects.Container;
  private hand!: TutorialHand;
  private banner: Phaser.GameObjects.Container | null = null;
  private gesture: Gesture | null = null;
  private held = new Set<'left' | 'right'>();
  private stickers: Sticker[] = [];
  private revealQueue: KeyArt[] = [];
  private newForms: FoundForm[] = [];
  private achievements: string[] = [];
  private shownScore = 0;
  private shownCoins = 0;
  private best = 0;
  private jarScale = 1;
  private jarBaseX = 0;
  private shakeOffset = 0;
  private removeMode = false;
  /** Открыто предложение «Второй шанс»: банка переполнена, игрок решает. */
  private offering = false;
  private cheerPending = false;
  /** Обучение первого забега: рука «веди → отпусти», пока не случится первое слияние. */
  private dragTutorial = false;
  /** Подсказка про тап-сквиш, пока игрок ни разу не тапнул по клавише. */
  private squishTutorial = false;
  private nextSquishHintAt = 0;
  private idleMs = 0;
  private ending = false;
  private frozen = false;
  private clock = 0;
  private snapshotTimer = 0;

  constructor() {
    super('Game');
  }

  create(data: GameSceneData = {}): void {
    this.setupScreen();
    this.resetState();
    const { ctx } = this;
    const save = ctx.save.data;
    const world = data.snapshot?.world ?? data.world ?? save.worlds.selected;
    this.theme = getTheme(world) ?? getTheme(DEFAULT_THEME_ID) ?? THEMES[0]!;
    (this.scene.get('Background') as BackgroundScene | null)?.setTheme(this.theme);
    this.art = ensureThemeArt(this, this.theme, ctx.lang);
    ensureFxArt(this);
    ensureUiArt(this);
    this.dragTutorial = !save.tutorial.done;
    this.squishTutorial = !save.tutorial.squish;
    this.run = new Run(phaserMatter, this.theme, {
      snapshot: data.snapshot,
      seed: e2eSeed(),
      // Шанс золотой клавиши и веса спавна можно подкрутить флагами remote config.
      modifiers: runModifiers(save.upgrades, ctx.flags.goldenChance),
      spawn: { ...SPAWN, weights: ctx.flags.spawnWeights },
      // Первые клавиши обучения: первое слияние — на втором-третьем броске (диздок, раздел 9).
      opening: this.dragTutorial && !data.snapshot ? TUTORIAL.openingTiers : undefined,
      trial: data.trial,
    });
    this.nextSquishHintAt = Math.max(TUTORIAL.squishHintAfterMs, this.run.elapsedMs + 5000);
    this.best = save.stats.bestScore;
    const stats = this.run.getStats();
    this.shownScore = stats.score;
    this.shownCoins = stats.coins;

    this.buildJar();
    const charges = this.run.charges;
    this.hud = new RunHud(
      this,
      ctx.t,
      ctx.lang,
      this.run.upcoming.length,
      {
        shake: save.upgrades.shake > 0 || charges.shakes > 0,
        remove: save.upgrades.remove > 0 || charges.removes > 0,
      },
      {
        onPause: () => this.openPause(),
        onShake: () => this.onShakeButton(),
        onRemove: () => this.onRemoveButton(),
      },
    );
    this.hud.setCharges(charges.shakes, charges.removes, this.toolOffers());
    this.coinFlights = new CoinFlights(this, ctx.reducedMotion);
    this.reveal = new FormReveal(this, ctx.reducedMotion);
    this.toasts = new Toasts(this, ctx.reducedMotion);

    for (const key of this.run.keys) this.createView(key);
    const flying = this.run.meteorInFlight;
    if (flying) this.createMeteorView(flying);
    this.showHanging(false);
    this.updatePreview();
    this.updateScore(true);
    this.hud.setCoins(this.shownCoins);

    this.addCleanup(this.run.on((event) => this.onRunEvent(event)));
    this.addCleanup(() => this.abandonIfUnfinished());
    this.addCleanup(() => this.run.destroy());
    const onPageHide = (): void => this.saveSnapshot();
    window.addEventListener('pagehide', onPageHide);
    this.addCleanup(() => window.removeEventListener('pagehide', onPageHide));
    this.saveSnapshot();
    this.bindInput();
    this.bindPause();
    this.layoutScreen(this.screenHeight);
  }

  override update(time: number, delta: number): void {
    this.clock = time;
    const halted = this.halted;
    if (!halted && !this.ending) {
      const direction = (this.held.has('right') ? 1 : 0) - (this.held.has('left') ? 1 : 0);
      if (direction !== 0) this.run.moveAim((direction * DROP.keyboardSpeed * delta) / 1000);
    }
    const alpha = halted ? 1 : this.run.update(delta);
    if (!halted && !this.ending) {
      this.snapshotTimer += delta;
      if (this.snapshotTimer >= RUN.snapshotIntervalMs) {
        this.snapshotTimer = 0;
        this.saveSnapshot();
      }
    }
    this.renderKeys(alpha);
    this.renderHanging(time);
    this.danger.tick(time, this.run.dangerMs, this.ctx.reducedMotion);
    this.views.forEach((view) => view.tick(delta, time));
    this.hanging?.tick(delta, time);
    this.tickMeteor(delta, time, halted);
    this.tickScore(delta);
    this.updateHints(delta);
    this.tickStickers();
    this.toasts.tick(delta, time);
    this.reveal.tick(delta, time);
    this.jarRoot.x = this.jarBaseX + this.shakeOffset;
    if (this.removeHint.visible && !this.ctx.reducedMotion) {
      this.removeHint.setAlpha(0.75 + 0.25 * Math.sin(time / 180));
    }
  }

  protected layoutScreen(height: number): void {
    const { layout } = this.ctx;
    const visibleLeft = -layout.column.x / layout.scale;
    const visibleTop = -layout.column.y / layout.scale;
    const visibleWidth = layout.canvasWidth / layout.scale;
    const visibleHeight = layout.canvasHeight / layout.scale;
    const visibleRight = visibleLeft + visibleWidth;
    const view = this.view();
    const viewWidth = view.right - view.left;
    const viewHeight = view.bottom - view.top;
    const toolsHeight = this.hud.hasTools ? HUD_TOOLS_HEIGHT : 0;

    // HUD сверху, а если экран низкий и по бокам много места (телефон лёжа) — по бокам от банки.
    const topScale = Math.min(
      (720 - 24) / viewWidth,
      (height - HUD_TOP_HEIGHT - 16 - toolsHeight) / viewHeight,
    );
    const sideRoom = Math.min(-visibleLeft, visibleRight - 720);
    const sideScale =
      sideRoom >= HUD_SIDE_ROOM ? Math.min((720 - 24) / viewWidth, (height - 32) / viewHeight) : 0;
    const side = sideScale > topScale * 1.1;
    const scale = side ? sideScale : topScale;
    this.jarScale = scale;

    const freeHeight = side
      ? height - viewHeight * scale
      : height - HUD_TOP_HEIGHT - 8 - toolsHeight - viewHeight * scale;
    const jarTop = side ? freeHeight / 2 : HUD_TOP_HEIGHT + Math.max(0, freeHeight * 0.45);
    this.jarRoot.setScale(scale);
    this.jarBaseX = 360 - ((view.left + view.right) / 2) * scale;
    this.jarRoot.setPosition(this.jarBaseX + this.shakeOffset, jarTop - view.top * scale);

    const jarBottom = jarTop + viewHeight * scale;
    this.hud.layout(side ? 'side' : 'top', height, visibleLeft, visibleRight, jarBottom);
    this.banner?.setPosition(this.run.jar.width / 2, JAR.height * 0.38);
    this.removeHint.setPosition(this.run.jar.width / 2, JAR.height * 0.22);
    // Лёжа плашки встают в левую панель, чтобы не закрывать висящую клавишу.
    if (side) this.toasts.setAnchor(visibleLeft / 2, height - 84, -visibleLeft - 32);
    else this.toasts.setAnchor(360, HUD_TOP_HEIGHT + 64);
    this.reveal.layout(
      { x: visibleLeft, y: visibleTop, width: visibleWidth, height: visibleHeight },
      Math.max(300, Math.min(height - 300, height * 0.46)),
    );
  }

  /** Физика стоит: показ новой формы или стоп-кадр автотеста. */
  private get halted(): boolean {
    return this.frozen || this.reveal.kind !== null;
  }

  /** Область банки на экране в единицах физики: с висящей клавишей сверху и тенью снизу. */
  private view(): { left: number; right: number; top: number; bottom: number } {
    return {
      left: -JAR.wall - 14,
      right: this.run.jar.width + JAR.wall + 14,
      top: -(JAR.hangGap + MAX_HANG_HEIGHT + 26),
      bottom: JAR.height + JAR.wall + 34,
    };
  }

  // ── Построение экрана ────────────────────────────────────────────────────────────────

  private resetState(): void {
    this.views = new Map();
    this.lastImpact = new Map();
    this.goldArt = new Map();
    this.hanging = null;
    this.meteorView = null;
    this.trailMs = 0;
    this.banner = null;
    this.gesture = null;
    this.held = new Set();
    this.stickers = [];
    this.revealQueue = [];
    this.newForms = [];
    this.achievements = [];
    this.shakeOffset = 0;
    this.removeMode = false;
    this.offering = false;
    this.cheerPending = false;
    this.idleMs = 0;
    this.ending = false;
    this.frozen = false;
    this.snapshotTimer = 0;
  }

  private buildJar(): void {
    const jar = new JarView(this, this.run.jar, this.theme.palette);
    this.danger = new DangerLine(this, this.run.jar, this.theme.palette);
    this.guide = new AimGuide(this, this.theme.palette);
    this.fx = new Particles(this, this.ctx.reducedMotion);
    this.keysLayer = new Phaser.GameObjects.Container(this, 0, 0);
    this.stickerLayer = new Phaser.GameObjects.Container(this, 0, 0);
    this.removeHint = this.createRemoveHint();
    this.hand = new TutorialHand(this);
    this.jarRoot = this.add.container(0, 0, [
      jar.back,
      this.guide.graphics,
      this.keysLayer,
      this.danger.graphics,
      jar.front,
      this.fx.layer,
      this.stickerLayer,
      this.removeHint,
      this.hand.layer,
    ]);
  }

  /** Подсказка режима «Удаление»: какую клавишу убрать, игрок выбирает тапом. */
  private createRemoveHint(): Phaser.GameObjects.Container {
    const label = this.createText(
      0,
      0,
      this.ctx.t('game.removeHint'),
      { fontSize: '30px', fontStyle: '900', color: '#5a1a33' },
      false,
    ).setOrigin(0.5);
    const width = Math.min(JAR.width - 40, label.width + 56);
    label.setScale(Math.min(1, (width - 40) / label.width));
    const height = 72;
    const panel = new Phaser.GameObjects.Graphics(this);
    panel.fillStyle(0xffffff, 0.94);
    panel.fillRoundedRect(-width / 2, -height / 2, width, height, height / 2);
    panel.lineStyle(4, 0xe0708f, 1);
    panel.strokeRoundedRect(-width / 2, -height / 2, width, height, height / 2);
    return new Phaser.GameObjects.Container(this, 0, 0, [panel, label]).setVisible(false);
  }

  /** Текстура формы: обычная или золотая (золотые рисуются при первой встрече). */
  private artFor(tier: number, golden = false): KeyArt {
    const art = this.art[tier - 1];
    if (!art) throw new Error(`Нет текстуры для тира ${tier}`);
    if (!golden) return art;
    let gold = this.goldArt.get(tier);
    if (!gold) {
      gold = goldenArt(this, this.theme, this.ctx.lang, art);
      this.goldArt.set(tier, gold);
    }
    return gold;
  }

  private newKeycap(tier: number, golden: boolean): Keycap {
    return new Keycap(this, this.artFor(tier, golden), {
      idle: !this.ctx.reducedMotion,
      random: Math.random,
    });
  }

  private createView(key: RunKey): Keycap {
    const view = this.newKeycap(key.tier, key.golden);
    if (key.caramel === 'fresh' || key.caramel === 'stuck') {
      view.setCaramel(caramelTexture(this, view.art));
    }
    view.setPosition(key.body.position.x, key.body.position.y);
    view.setRotation(key.body.angle);
    this.keysLayer.add(view);
    this.views.set(key.id, view);
    return view;
  }

  private createMeteorView(meteor: RunMeteor): MeteorView {
    this.meteorView?.destroy();
    const view = new MeteorView(this, meteor.size, !this.ctx.reducedMotion);
    view.setPosition(meteor.body.position.x, meteor.body.position.y);
    this.keysLayer.add(view);
    this.meteorView = view;
    return view;
  }

  /** «Метеорчик» в полёте: позиция между шагами физики и искорки из хвоста. */
  private tickMeteor(delta: number, time: number, halted: boolean): void {
    const view = this.meteorView;
    if (!view) return;
    view.tick(delta, time);
    if (halted) return;
    this.trailMs += delta;
    if (this.trailMs >= TRAIL_MS) {
      this.trailMs = 0;
      this.fx.trail(view.x + (Math.random() - 0.5) * view.size * 0.5, view.y - view.size * 0.6);
    }
  }

  // ── Отрисовка состояния забега ───────────────────────────────────────────────────────

  private renderKeys(alpha: number): void {
    for (const key of this.run.keys) {
      const view = this.views.get(key.id);
      if (!view) continue;
      const { position, angle } = key.body;
      view.setPosition(
        key.prevX + (position.x - key.prevX) * alpha,
        key.prevY + (position.y - key.prevY) * alpha,
      );
      view.setRotation(key.prevAngle + (angle - key.prevAngle) * alpha);
    }
    const meteor = this.run.meteorInFlight;
    if (meteor && this.meteorView) {
      const { position, angle } = meteor.body;
      this.meteorView.setPosition(
        meteor.prevX + (position.x - meteor.prevX) * alpha,
        meteor.prevY + (position.y - meteor.prevY) * alpha,
      );
      this.meteorView.setSpin(meteor.prevAngle + (angle - meteor.prevAngle) * alpha);
    }
  }

  private renderHanging(time: number): void {
    const hanging = this.hanging;
    const ready =
      hanging !== null && this.run.canDrop && !this.ending && !this.removeMode && !this.halted;
    if (hanging) {
      const bob = this.ctx.reducedMotion ? 0 : Math.sin(time / 420) * 3;
      hanging.setPosition(this.run.aimX, this.run.hangY() + bob);
    }
    const { height } = this.run.currentSize;
    const from = this.run.hangY() + height / 2;
    this.guide.draw(this.run.aimX, from, this.surfaceBelow(this.run.aimX), ready);
  }

  /** На какой высоте висящая клавиша встретит верх кучи (для пунктира прицела). */
  private surfaceBelow(x: number): number {
    const half = this.run.currentSize.width / 2;
    let surface: number = JAR.height;
    for (const key of this.run.keys) {
      const { min, max } = key.body.bounds;
      if (x + half <= min.x || x - half >= max.x) continue;
      surface = Math.min(surface, min.y);
    }
    return surface;
  }

  /** Висящая клавиша над банкой: появляется с «попом», когда её можно сбросить. */
  private showHanging(animate: boolean): void {
    this.hanging?.destroy();
    const item = this.run.current;
    let view: Keycap | MeteorView;
    if (item.meteor) {
      view = new MeteorView(this, this.run.currentSize.width, !this.ctx.reducedMotion);
    } else {
      const keycap = this.newKeycap(item.tier, item.golden);
      if (item.caramel) keycap.setCaramel(caramelTexture(this, keycap.art));
      view = keycap;
    }
    view.setPosition(this.run.aimX, this.run.hangY());
    this.keysLayer.add(view);
    this.hanging = view;
    if (animate && !this.ctx.reducedMotion) {
      view.pop = 0.4;
      this.tweens.add({ targets: view, pop: 1, duration: 220, ease: 'Back.easeOut' });
    }
  }

  private updatePreview(): void {
    this.hud.setPreview(
      this.run.upcoming.map((item): HudPreview => {
        if (item.meteor) return { meteor: this.run.itemSize(item).width };
        const art = this.artFor(item.tier, item.golden);
        return { art, caramel: item.caramel ? caramelTexture(this, art) : null };
      }),
    );
  }

  private updateScore(immediate: boolean): void {
    if (immediate || this.ctx.reducedMotion) this.shownScore = this.run.score;
    // Рекорд растёт вместе с «дотикивающим» счётом, а не раньше него.
    const best = Math.max(this.best, this.shownScore);
    this.hud.setScore(this.shownScore, best, this.shownScore > this.best && this.best > 0);
  }

  /** Счёт «дотикивает» до настоящего за доли секунды. */
  private tickScore(delta: number): void {
    const target = this.run.score;
    if (this.shownScore === target) return;
    const step = Math.max(1, Math.ceil((target - this.shownScore) * Math.min(1, delta / 120)));
    this.shownScore = Math.min(target, this.shownScore + step);
    this.updateScore(false);
  }

  /** Наклейки «Новая!» следуют за своей клавишей и исчезают через пару секунд. */
  private tickStickers(): void {
    if (this.stickers.length === 0) return;
    this.stickers = this.stickers.filter((sticker) => {
      const view = this.views.get(sticker.keyId);
      if (!view || this.clock >= sticker.until) {
        this.tweens.add({
          targets: sticker.label,
          alpha: 0,
          duration: 200,
          onComplete: () => sticker.label.destroy(),
        });
        return false;
      }
      sticker.label.setPosition(view.x, view.y - view.art.height / 2 - 26);
      return true;
    });
  }

  // ── События забега ───────────────────────────────────────────────────────────────────

  private onRunEvent(event: RunEvent): void {
    switch (event.type) {
      case 'drop': {
        const view = this.createView(event.key);
        view.squash(-0.25);
        this.ctx.audio.drop();
        this.hanging?.destroy();
        this.hanging = null;
        this.updatePreview();
        this.discover(event.key, 'drop');
        break;
      }
      case 'ready':
        this.showHanging(true);
        break;
      case 'land':
        this.views.get(event.key.id)?.squash(Math.min(1, event.speed / 12));
        this.ctx.audio.land(event.speed, event.key.tier);
        break;
      case 'impact': {
        const last = this.lastImpact.get(event.key.id) ?? Number.NEGATIVE_INFINITY;
        if (this.clock - last < IMPACT_COOLDOWN_MS) break;
        this.lastImpact.set(event.key.id, this.clock);
        this.views.get(event.key.id)?.squash(Math.min(0.6, event.speed / 18));
        break;
      }
      case 'merge':
        this.onMerge(event);
        break;
      case 'squish': {
        const view = this.views.get(event.key.id);
        view?.squash(0.9);
        view?.showFace('squish', 280);
        this.ctx.audio.squish(event.key.tier);
        this.fx.squish(event.key.body.position.x, event.key.body.bounds.min.y);
        this.learnedSquish();
        break;
      }
      case 'shake':
        this.onShake();
        break;
      case 'remove':
        this.updateCharges();
        this.poofKey(event.key);
        break;
      case 'revive':
        event.removed.forEach((key) => this.poofKey(key));
        break;
      case 'charge':
        this.updateCharges();
        this.bumpTool(event.tool);
        break;
      case 'danger':
        this.danger.setWarning(event.warning);
        break;
      case 'stick': {
        const view = this.views.get(event.key.id);
        view?.squash(0.6);
        view?.showFace('squish', 500);
        this.fx.drips(event.key.body.position.x, event.key.body.position.y);
        this.ctx.audio.stick();
        break;
      }
      case 'unstick': {
        const view = this.views.get(event.key.id);
        view?.meltCaramel(this.ctx.reducedMotion);
        view?.squash(-0.3);
        this.fx.drips(event.key.body.position.x, event.key.body.position.y);
        this.ctx.audio.unstick();
        break;
      }
      case 'meteorDrop':
        this.hanging?.destroy();
        this.hanging = null;
        this.createMeteorView(event.meteor);
        this.updatePreview();
        this.ctx.audio.meteorDrop();
        break;
      case 'meteorHit':
        this.onMeteorHit(event.key, event.x, event.y);
        break;
      case 'meteorGone':
        this.removeMeteorView(event.x, event.y);
        this.ctx.audio.meteorGone();
        break;
      case 'gameover':
        this.onOverflow();
        break;
    }
  }

  private onMerge(event: Extract<RunEvent, { type: 'merge' }>): void {
    this.finishDragTutorial();
    // Сжатие → «клац» → поп: старые клавиши съезжаются в точку слияния и тают, новая выпрыгивает.
    for (const key of event.removed) {
      const view = this.views.get(key.id);
      this.views.delete(key.id);
      this.lastImpact.delete(key.id);
      if (!view) continue;
      this.tweens.add({
        targets: view,
        x: event.x,
        y: event.y,
        pop: 0.35,
        alpha: 0,
        duration: 120,
        ease: 'Quad.easeIn',
        onComplete: () => view.destroy(),
      });
    }
    const { t } = this.ctx;
    if (event.created) {
      const created = event.created;
      const view = this.createView(created);
      if (!this.ctx.reducedMotion) {
        view.pop = 0.55;
        this.tweens.add({ targets: view, pop: 1, duration: 260, ease: 'Back.easeOut' });
      }
      view.squash(-0.35);
      const tier = created.tier;
      const color = hexToNumber(this.artFor(tier, created.golden).colors.base);
      this.fx.merge(event.x, event.y, color, tier, t('game.clack'), event.score);
      const reveal = this.discover(created, 'merge');
      // Легендарный показ играет свои фанфары: звук формы поверх него не нужен.
      if (reveal !== 'legendary') this.ctx.audio.form(formOf(this.theme, tier).sound, event.combo);
      if (tier === maxTier(this.theme)) {
        // Все клавиши в банке радуются Пробелу — после показа, если он есть.
        if (reveal) this.cheerPending = true;
        else this.cheer();
      }
    } else {
      this.fx.mega(event.x, event.y, t('game.mega'), event.score);
      this.ctx.audio.mega();
    }
    if (event.coins > 0) {
      const from = this.jarToScene(event.x, event.y);
      this.coinFlights.launch(from, this.hud.coinTarget(), event.coins, (value) => {
        this.shownCoins += value;
        this.hud.setCoins(this.shownCoins);
        this.hud.bumpCoins();
        this.ctx.audio.coin();
      });
    }
    if (!this.ctx.reducedMotion) this.hud.bumpScore();
    this.checkAchievements();
  }

  /** «Встряска»: банка качается, клавиши подпрыгивают. */
  private onShake(): void {
    this.updateCharges();
    this.ctx.audio.shake();
    this.views.forEach((view) => view.squash(0.5));
    if (this.ctx.reducedMotion) return;
    const wobble = { t: 0 };
    this.tweens.add({
      targets: wobble,
      t: 1,
      duration: 420,
      onUpdate: () => {
        this.shakeOffset = Math.sin(wobble.t * Math.PI * 6) * 14 * (1 - wobble.t);
      },
      onComplete: () => {
        this.shakeOffset = 0;
      },
    });
  }

  /** Клавиша исчезает с «пуф» («Удаление», «Второй шанс»). */
  private poofKey(key: RunKey): void {
    const view = this.views.get(key.id);
    this.views.delete(key.id);
    this.lastImpact.delete(key.id);
    const color = hexToNumber(this.artFor(key.tier, key.golden).colors.base);
    this.fx.poof(key.body.position.x, key.body.position.y, color);
    this.ctx.audio.poof();
    if (!view) return;
    if (this.ctx.reducedMotion) {
      view.destroy();
      return;
    }
    this.tweens.add({
      targets: view,
      pop: 0,
      alpha: 0,
      angle: view.angle + 90,
      duration: 240,
      ease: 'Back.easeIn',
      onComplete: () => view.destroy(),
    });
  }

  /**
   * «Метеорчик» попал в клавишу: она не ломается, а мягко улетает вверх с блёстками
   * (игра 0+: без взрывов и обломков).
   */
  private onMeteorHit(key: RunKey, x: number, y: number): void {
    this.removeMeteorView(x, y);
    const view = this.views.get(key.id);
    this.views.delete(key.id);
    this.lastImpact.delete(key.id);
    const color = hexToNumber(this.artFor(key.tier, key.golden).colors.base);
    this.fx.stardust(key.body.position.x, key.body.position.y, color);
    this.ctx.audio.meteorHit();
    if (!view) return;
    if (this.ctx.reducedMotion) {
      view.destroy();
      return;
    }
    view.showFace('joy', 600);
    this.tweens.add({
      targets: view,
      y: view.y - 160,
      angle: view.angle + (Math.random() < 0.5 ? -40 : 40),
      pop: 0.4,
      alpha: 0,
      duration: 650,
      ease: 'Quad.easeOut',
      onComplete: () => view.destroy(),
    });
  }

  /** «Метеорчик» исчезает с искорками: попал в клавишу или долетел до дна. */
  private removeMeteorView(x: number, y: number): void {
    const view = this.meteorView;
    this.meteorView = null;
    this.fx.stardust(x, y, 0xc9b6ff);
    if (!view) return;
    if (this.ctx.reducedMotion) {
      view.destroy();
      return;
    }
    view.setTail(false);
    this.tweens.add({
      targets: view,
      pop: 0,
      alpha: 0,
      duration: 220,
      ease: 'Back.easeIn',
      onComplete: () => view.destroy(),
    });
  }

  // ── Инструменты ──────────────────────────────────────────────────────────────────────

  /** За рекламу можно получить ещё заряд: заряды кончились, а бонус в забеге ещё не брали. */
  private toolOffers(): HudTools {
    return { shake: this.run.canAddCharge('shake'), remove: this.run.canAddCharge('remove') };
  }

  private updateCharges(): void {
    const { shakes, removes } = this.run.charges;
    this.hud.setCharges(shakes, removes, this.toolOffers());
  }

  private onShakeButton(): void {
    if (this.run.charges.shakes === 0 && this.run.canAddCharge('shake')) this.offerCharge('shake');
    else this.useShake();
  }

  private onRemoveButton(): void {
    if (!this.removeMode && this.run.charges.removes === 0 && this.run.canAddCharge('remove')) {
      this.offerCharge('remove');
    } else {
      this.setRemoveMode(!this.removeMode);
    }
  }

  /** Кнопка инструмента «подпрыгивает», когда в ней появился заряд. */
  private bumpTool(tool: ToolId): void {
    const button = tool === 'shake' ? this.hud.shake : this.hud.remove;
    if (!button || this.ctx.reducedMotion) return;
    this.tweens.killTweensOf(button);
    button.setScale(1.2);
    this.tweens.add({ targets: button, scale: 1, duration: 320, ease: 'Back.easeOut' });
  }

  // ── Реклама за награду ───────────────────────────────────────────────────────────────

  /** Окно «за рекламу» поверх забега (сцена Offer). */
  private openOffer(data: OfferData): void {
    this.gesture = null;
    this.held.clear();
    this.scene.launch('Offer', data);
  }

  /**
   * Заряды кончились: «+1 Встряска» или «+1 Удаление» за рекламу, раз за забег на каждый
   * инструмент (диздок, раздел 8). Пока окно открыто, забег на паузе.
   */
  private offerCharge(tool: ToolId): void {
    if (this.ending || this.offering || this.halted) return;
    const { t } = this.ctx;
    const texts =
      tool === 'shake'
        ? {
            title: t('offer.shake.title'),
            text: t('offer.shake.text'),
            watch: t('offer.shake.watch'),
          }
        : {
            title: t('offer.remove.title'),
            text: t('offer.remove.text'),
            watch: t('offer.remove.watch'),
          };
    this.setRemoveMode(false);
    this.ctx.pause.setUserPaused(true);
    const resume = (): void => this.ctx.pause.setUserPaused(false);
    this.openOffer({
      kind: tool,
      title: texts.title,
      text: texts.text,
      watchLabel: texts.watch,
      declineLabel: t('offer.decline'),
      // Заряд выдаётся только в колбэке onRewarded.
      watch: () => this.ctx.ads.rewarded(() => this.run.addCharge(tool)),
      onDone: resume,
      onDecline: resume,
    });
  }

  /** Банка переполнена: «Второй шанс» за рекламу (раз за забег) или сразу конец забега. */
  private onOverflow(): void {
    if (!this.ctx.flags.secondChanceEnabled || !this.run.canRevive) {
      this.endRun();
      return;
    }
    const { ctx } = this;
    this.setRemoveMode(false);
    this.offering = true;
    this.gesture = null;
    this.held.clear();
    this.hud.setControlsVisible(false);
    // Пока игрок решает, забег не идёт: разметка геймплея остановлена.
    ctx.pause.setRunActive(false);
    ctx.audio.gameOver();
    this.openOffer({
      kind: 'secondChance',
      title: ctx.t('game.overflow'),
      text: ctx.t('offer.secondChance.text', { count: ADS.secondChanceKeys }),
      watchLabel: ctx.t('offer.secondChance.watch'),
      declineLabel: ctx.t('offer.secondChance.decline'),
      // Верхние клавиши убираются только в колбэке onRewarded.
      watch: () => ctx.ads.rewarded(() => this.run.revive(ADS.secondChanceKeys)),
      onDone: () => this.continueAfterRevive(),
      onDecline: () => {
        this.offering = false;
        this.endRun(false);
      },
    });
  }

  /** «Второй шанс» получен: забег продолжается. */
  private continueAfterRevive(): void {
    this.offering = false;
    if (this.run.over) {
      // Реклама засчитана, но забег не ожил (так не бывает): просто заканчиваем.
      this.endRun(false);
      return;
    }
    this.hud.setControlsVisible(true);
    this.updateCharges();
    this.updatePauseButton();
    if (!this.hanging) this.showHanging(true);
    this.ctx.pause.setRunActive(true);
    this.saveSnapshot();
  }

  private useShake(): void {
    if (this.halted || this.ending) return;
    this.setRemoveMode(false);
    this.run.shake();
  }

  /** Режим «Удаление»: следующий тап по клавише убирает её, тап мимо — отменяет режим. */
  private setRemoveMode(on: boolean): void {
    const enabled = on && !this.ending && !this.halted && this.run.charges.removes > 0;
    if (this.removeMode === enabled) return;
    this.removeMode = enabled;
    this.hud.setRemoveMode(enabled);
    this.removeHint.setVisible(enabled).setAlpha(1);
    if (enabled) this.gesture = null;
  }

  // ── Обучение ─────────────────────────────────────────────────────────────────────────

  /** Подсказки обучения: рука «веди → отпусти», пока игрок бездействует, и «тап-тап» позже. */
  private updateHints(delta: number): void {
    const { hand } = this;
    const busy =
      this.halted ||
      this.ending ||
      this.offering ||
      this.removeMode ||
      this.gesture !== null ||
      this.held.size > 0;
    if (busy) {
      this.idleMs = 0;
      if (hand.kind === 'drag' || (this.halted && hand.kind === 'tap')) hand.hide();
    } else {
      this.idleMs += delta;
    }
    if (this.dragTutorial) {
      if (!busy && this.run.canDrop && this.idleMs >= TUTORIAL.handDelayMs) this.showDragHint();
      else if (hand.kind === 'drag' && !this.run.canDrop) hand.hide();
    } else if (
      this.squishTutorial &&
      !busy &&
      hand.kind === null &&
      this.run.elapsedMs >= this.nextSquishHintAt
    ) {
      this.nextSquishHintAt = this.run.elapsedMs + TUTORIAL.squishHintRepeatMs;
      this.showSquishHint();
    }
    hand.tick(delta);
  }

  /**
   * Рука берёт висящую клавишу, ведёт её к такой же клавише в банке и отпускает.
   * Если такой клавиши нет — просто ведёт в сторону, чтобы было видно «веди → отпусти».
   */
  private showDragHint(): void {
    if (this.run.current.meteor) return;
    const { tier, golden } = this.run.current;
    const width = this.run.jar.width;
    const size = this.run.sizeOf(tier);
    const fromX = this.run.aimX;
    let toX = fromX < width / 2 ? fromX + 160 : fromX - 160;
    let topY = Number.POSITIVE_INFINITY;
    for (const key of this.run.keys) {
      if (key.tier !== tier || key.body.position.y >= topY) continue;
      topY = key.body.position.y;
      toX = key.body.position.x;
    }
    toX = Math.min(width - size.width / 2, Math.max(size.width / 2, toX));
    this.hand.showDrag({
      art: this.artFor(tier, golden),
      fromX,
      toX,
      y: this.run.hangY(),
      fallY: this.surfaceBelow(toX) - size.height / 2,
    });
  }

  /** «Тап-тап» по верхней клавише кучи: она сминается, как от настоящего тапа. */
  private showSquishHint(): void {
    let target: RunKey | null = null;
    for (const key of this.run.keys) {
      if (!key.settled) continue;
      if (!target || key.body.position.y < target.body.position.y) target = key;
    }
    if (!target) return;
    const { id } = target;
    this.hand.showTap({
      x: target.body.position.x,
      y: target.body.position.y,
      onPress: () => {
        const view = this.views.get(id);
        view?.squash(0.8);
        view?.showFace('squish', 240);
      },
    });
  }

  /** Первое слияние случилось: обучение пройдено, рука больше не показывается. */
  private finishDragTutorial(): void {
    if (!this.dragTutorial) return;
    this.dragTutorial = false;
    if (this.hand.kind === 'drag') this.hand.hide();
    this.ctx.save.update((draft) => {
      draft.tutorial.done = true;
    });
  }

  /** Игрок сам тапнул по клавише: подсказка про сквиш больше не нужна. */
  private learnedSquish(): void {
    if (!this.squishTutorial) return;
    this.squishTutorial = false;
    if (this.hand.kind === 'tap') this.hand.hide();
    this.ctx.save.update((draft) => {
      draft.tutorial.squish = true;
    });
  }

  // ── Альбом, показы и достижения ──────────────────────────────────────────────────────

  /**
   * Клавиша появилась в банке: если такой формы ещё не было, она попадает в альбом
   * (сохраняется сразу). Новая форма из слияния показывается крупно, упавшая сверху
   * получает наклейку «Новая!». Возвращает, какой показ запущен.
   */
  private discover(key: RunKey, source: 'drop' | 'merge'): RevealKind | null {
    const { ctx } = this;
    const world = this.theme.id;
    if (isDiscovered(ctx.save.data.album, world, key.tier, key.golden)) return null;
    let found = { form: false, golden: false };
    ctx.save.update((draft) => {
      found = discoverForm(draft, world, key.tier, key.golden);
    });
    if (!found.form && !found.golden) return null;
    this.newForms.push({ tier: key.tier, golden: found.golden });
    const art = this.artFor(key.tier, key.golden);
    const name = formOf(this.theme, key.tier).name[ctx.lang];
    if (found.golden) {
      this.toasts.show({
        icon: { kind: 'key', art },
        title: ctx.t('game.goldenForm'),
        detail: name,
      });
    }
    this.checkAchievements();
    if (!found.form) return null;
    if (source === 'drop') {
      this.addSticker(key);
      return null;
    }
    this.revealQueue.push(art);
    if (!this.reveal.kind) this.nextReveal();
    return key.tier === maxTier(this.theme) ? 'legendary' : 'form';
  }

  /** Показ следующей новой формы из очереди. Пока идёт показ, физика стоит. */
  private nextReveal(): void {
    const art = this.revealQueue.shift();
    if (!art) {
      if (this.cheerPending) {
        this.cheerPending = false;
        this.cheer();
      }
      return;
    }
    const { t, lang, audio } = this.ctx;
    const legendary = art.tier === maxTier(this.theme);
    this.gesture = null;
    this.setRemoveMode(false);
    if (legendary) audio.legendary();
    else audio.newForm();
    this.reveal.show(
      {
        art,
        name: formOf(this.theme, art.tier).name[lang],
        title: t(legendary ? 'game.legendary' : 'game.newForm'),
        legendary,
        hint: t('game.tapToContinue'),
        durationMs: legendary ? NEW_FORM.legendaryMs : NEW_FORM.freezeMs,
      },
      () => this.nextReveal(),
    );
  }

  private addSticker(key: RunKey): void {
    const label = this.createText(
      0,
      0,
      this.ctx.t('game.newSticker'),
      {
        fontSize: '28px',
        fontStyle: '900',
        color: '#e0457b',
        stroke: '#ffffff',
        strokeThickness: 8,
      },
      false,
    ).setOrigin(0.5);
    this.stickerLayer.add(label);
    if (!this.ctx.reducedMotion) {
      label.setScale(0);
      this.tweens.add({ targets: label, scale: 1, duration: 260, ease: 'Back.easeOut' });
    }
    this.stickers.push({ keyId: key.id, label, until: this.clock + STICKER_MS });
    this.tickStickers();
  }

  /** Пасхалка: когда появляется Пробел, все клавиши в банке радуются и подпрыгивают. */
  private cheer(): void {
    let index = 0;
    for (const view of this.views.values()) {
      const delay = this.ctx.reducedMotion ? 0 : (index % 8) * 60;
      index += 1;
      this.time.delayedCall(delay, () => {
        if (!view.scene) return;
        view.showFace('joy', CHEER_MS);
        if (!this.ctx.reducedMotion) view.squash(-0.5);
      });
    }
    this.fx.celebrate(this.run.jar.width / 2, JAR.height * 0.4);
  }

  /** Новые достижения по сохранению и текущему забегу: награда сразу, плашка поверх игры. */
  private checkAchievements(): void {
    const { ctx } = this;
    const stats = this.run.getStats();
    const progress = { merges: stats.merges, goldenMerges: stats.goldenMerges, megas: stats.megas };
    const owned = ctx.save.data.achievements;
    const fresh = earnedAchievements(ctx.save.data, WORLD_SIZES, progress).filter(
      (id) => !owned.includes(id),
    );
    if (fresh.length === 0) return;
    let granted: AchievementDef[] = [];
    ctx.save.update((draft) => {
      granted = grantAchievements(draft, fresh, WORLD_SIZES);
    });
    for (const def of granted) {
      this.achievements.push(def.id);
      this.toasts.show({
        icon: { kind: 'medal' },
        title: ctx.t('game.achievement'),
        detail: achievementTitle(def, ctx.t, ctx.lang),
        coins: def.reward,
      });
      ctx.audio.achievement();
    }
  }

  // ── Конец забега ─────────────────────────────────────────────────────────────────────

  /** Конец забега: итоги в сохранение и экран результата. playSound — звук уже был при переполнении. */
  private endRun(playSound = true): void {
    if (this.ending) return;
    this.setRemoveMode(false);
    this.ending = true;
    this.gesture = null;
    this.held.clear();
    this.hanging?.destroy();
    this.hanging = null;
    this.hud.hideControls();
    this.ctx.pause.setRunActive(false);
    if (playSound) this.ctx.audio.gameOver();

    const { ctx } = this;
    ctx.platform.saveRunSnapshot(null);
    const stats = this.run.getStats();
    const outcome = ctx.recordRun({
      score: stats.score,
      completed: true,
      merges: stats.merges,
      goldenMerges: stats.goldenMerges,
      megas: stats.megas,
      coins: stats.coins,
    });
    const summary: RunSummary = {
      score: stats.score,
      best: ctx.save.data.stats.bestScore,
      newRecord: outcome.newRecord,
      bestTier: stats.bestTier,
      world: this.theme.id,
      coins: outcome.coins,
      bonus: outcome.bonus,
      newForms: [...this.newForms],
      achievements: [...this.achievements],
    };

    this.banner = this.createBanner(ctx.t('game.overflow'));
    this.jarRoot.add(this.banner);
    this.layoutScreen(this.screenHeight);
    this.time.delayedCall(OVERFLOW_BANNER_MS, () => this.scene.start('Result', summary));
  }

  /** Мягкая надпись поверх банки: без укоров, просто «банка переполнена». */
  private createBanner(text: string): Phaser.GameObjects.Container {
    const label = this.createText(0, 0, text, titleStyle(52), false).setOrigin(0.5);
    const width = Math.min(this.run.jar.width - 20, label.width + 80);
    const height = label.height + 50;
    const panel = new Phaser.GameObjects.Graphics(this);
    panel.fillStyle(0xffffff, 0.92);
    panel.fillRoundedRect(-width / 2, -height / 2, width, height, 36);
    panel.lineStyle(5, hexToNumber(this.theme.palette.danger), 1);
    panel.strokeRoundedRect(-width / 2, -height / 2, width, height, 36);
    const banner = new Phaser.GameObjects.Container(this, 0, 0, [panel, label]);
    if (!this.ctx.reducedMotion) {
      banner.setScale(0.5);
      this.tweens.add({ targets: banner, scale: 1, duration: 320, ease: 'Back.easeOut' });
    }
    return banner;
  }

  // ── Снимок забега ────────────────────────────────────────────────────────────────────

  /** Снимок текущего забега в локальный кэш: после перезагрузки его предложат продолжить. */
  private saveSnapshot(): void {
    if (this.ending || this.run.over) return;
    this.ctx.platform.saveRunSnapshot(this.run.snapshot());
  }

  /** Выход в меню посреди забега: снимок больше не нужен, но хороший счёт становится рекордом. */
  private abandonIfUnfinished(): void {
    if (this.ending) return;
    const { ctx } = this;
    ctx.platform.saveRunSnapshot(null);
    const stats = this.run.getStats();
    ctx.recordRun({
      score: stats.score,
      completed: false,
      merges: stats.merges,
      goldenMerges: stats.goldenMerges,
      megas: stats.megas,
      coins: stats.coins,
    });
  }

  // ── Ввод ─────────────────────────────────────────────────────────────────────────────

  private toJar(pointer: Phaser.Input.Pointer): { x: number; y: number } {
    return {
      x: (pointer.worldX - this.jarRoot.x) / this.jarScale,
      y: (pointer.worldY - this.jarRoot.y) / this.jarScale,
    };
  }

  private bindInput(): void {
    const { Events } = Phaser.Input;
    this.input.on(
      Events.POINTER_DOWN,
      (pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
        if (over.length > 0 || this.gesture || this.ending || this.halted || this.offering) return;
        const point = this.toJar(pointer);
        const slop = pointer.wasTouch ? SQUISH.touchSlop : 0;
        const key = this.run.keyAt(point.x, point.y, slop);
        if (this.removeMode) {
          if (key) this.run.removeKey(key);
          this.setRemoveMode(false);
          this.gesture = { pointerId: pointer.id, kind: 'tool' };
          return;
        }
        if (key) {
          this.run.squish(key, point.x);
          this.gesture = { pointerId: pointer.id, kind: 'squish' };
          return;
        }
        this.gesture = { pointerId: pointer.id, kind: 'aim' };
        this.run.setAim(point.x);
      },
    );
    this.input.on(Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
      if (this.ending || this.halted || this.removeMode || this.offering) return;
      const aiming = this.gesture?.kind === 'aim' && this.gesture.pointerId === pointer.id;
      // Мышью прицел ведётся и без нажатия, пальцем — пока палец на экране.
      const hovering = !this.gesture && !pointer.wasTouch && !pointer.isDown;
      if (aiming || hovering) this.run.setAim(this.toJar(pointer).x);
    });
    const release = (pointer: Phaser.Input.Pointer): void => {
      if (!this.gesture || this.gesture.pointerId !== pointer.id) return;
      const { kind } = this.gesture;
      this.gesture = null;
      if (kind === 'aim' && !this.ending && !this.halted) this.run.drop();
    };
    this.input.on(Events.POINTER_UP, release);
    this.input.on(Events.POINTER_UP_OUTSIDE, release);

    const onKeyDown = (event: KeyboardEvent): void => {
      const action = actionForKey(event);
      if (!action || !this.sys.isActive()) return;
      event.preventDefault();
      if (action === 'left' || action === 'right') {
        this.held.add(action);
        return;
      }
      if (event.repeat || this.ending || this.offering) return;
      if (action === 'pause') {
        this.openPause();
        return;
      }
      // Space/Enter: пропустить легендарный показ, отменить «Удаление» или сбросить клавишу.
      if (this.reveal.kind) this.reveal.skip();
      else if (this.removeMode) this.setRemoveMode(false);
      else if (!this.halted) this.run.drop();
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      const action = actionForKey(event);
      if (action === 'left' || action === 'right') this.held.delete(action);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    this.addCleanup(() => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    });
  }

  private bindPause(): void {
    const { pause } = this.ctx;
    // Любая пауза (игрок, вкладка, фокус, реклама, SDK) останавливает физику, таймеры и анимации сцены.
    this.addCleanup(
      pause.subscribe({
        onPausedChange: (paused) => {
          this.updatePauseButton();
          if (paused) {
            // Отпущенные во время паузы клавиши и пальцы не должны «залипнуть».
            this.held.clear();
            this.gesture = null;
            this.setRemoveMode(false);
            // Снимок забега при любой паузе, в том числе при скрытии вкладки.
            this.saveSnapshot();
          }
          if (paused && this.sys.isActive()) this.scene.pause();
          else if (!paused && this.sys.isPaused()) this.scene.resume();
        },
      }),
    );
    pause.setRunActive(true);
    this.addCleanup(() => pause.setRunActive(false));
    // Если забег начался во время системной паузы, ставим сцену на паузу сразу после создания.
    this.events.once(Phaser.Scenes.Events.CREATE, () => {
      if (pause.isPaused) this.scene.pause();
    });
  }

  /** Пока открыт экран паузы или «Второй шанс», своя кнопка паузы не нужна и не выглядывает из-под окна. */
  private updatePauseButton(): void {
    this.hud.pause.setVisible(!this.ctx.pause.isUserPaused && !this.ending && !this.offering);
  }

  private openPause(): void {
    if (this.ending || this.offering) return;
    this.setRemoveMode(false);
    this.ctx.pause.setUserPaused(true);
    this.scene.launch('Pause');
  }

  // ── Режим бота (?bot=1) ──────────────────────────────────────────────────────────────

  /** Что видит бот, когда клавишу можно бросить; null — сейчас бросать нельзя. */
  botView(): BotView | null {
    if (!this.run.canDrop || this.halted || this.ending || this.offering || this.removeMode) {
      return null;
    }
    if (this.ctx.pause.isPaused) return null;
    const keys = [...this.run.keys].map((key) => ({
      tier: key.tier,
      x: key.body.position.x,
      top: key.body.bounds.min.y,
      width: key.body.bounds.max.x - key.body.bounds.min.x,
    }));
    return {
      tier: this.run.currentTier,
      width: this.run.currentSize.width,
      meteor: this.run.current.meteor === true,
      jarWidth: this.run.jar.width,
      floorY: this.run.jar.height,
      keys,
    };
  }

  /** Бросок бота: прицел и сброс, как с клавиатуры. */
  botDrop(x: number): void {
    if (!this.botView()) return;
    this.run.setAim(x);
    this.run.drop();
  }

  /** Бот не ждёт конца «ЛЕГЕНДАРНОЙ ФОРМЫ!»: пропускает её, как тапом. */
  botSkipReveal(): void {
    if (this.reveal.kind === 'legendary') this.reveal.skip();
  }

  // ── Для автотестов (window.__e2e) ────────────────────────────────────────────────────

  /** Состояние забега для проверок. */
  debugState(): {
    keys: { id: number; tier: number; golden: boolean; x: number; y: number; caramel: string }[];
    world: string;
    trial: boolean;
    special: 'caramel' | 'meteor' | null;
    meteor: boolean;
    score: number;
    over: boolean;
    ending: boolean;
    current: number;
    currentGolden: boolean;
    upcoming: number[];
    canDrop: boolean;
    danger: boolean;
    aimX: number;
    jarWidth: number;
    coins: number;
    shownCoins: number;
    charges: { shakes: number; removes: number };
    bonuses: { revive: boolean; shake: boolean; remove: boolean };
    offering: boolean;
    removeMode: boolean;
    reveal: RevealKind | null;
    revealMs: number;
    hint: HintKind | null;
    toasts: number;
    stickers: number;
  } {
    return {
      keys: [...this.run.keys].map((key) => ({
        id: key.id,
        tier: key.tier,
        golden: key.golden,
        x: key.body.position.x,
        y: key.body.position.y,
        caramel: key.caramel,
      })),
      world: this.theme.id,
      trial: this.run.trial,
      special: this.run.current.meteor ? 'meteor' : this.run.current.caramel ? 'caramel' : null,
      meteor: this.run.meteorInFlight !== null,
      score: this.run.score,
      over: this.run.over,
      ending: this.ending,
      current: this.run.currentTier,
      currentGolden: this.run.current.golden,
      upcoming: this.run.upcoming.map((item) => item.tier),
      canDrop: this.run.canDrop && !this.halted && !this.ending && !this.removeMode,
      danger: this.run.dangerWarning,
      aimX: this.run.aimX,
      jarWidth: this.run.jar.width,
      coins: this.run.getStats().coins,
      shownCoins: this.shownCoins,
      charges: this.run.charges,
      bonuses: { ...this.run.bonuses },
      offering: this.offering,
      removeMode: this.removeMode,
      reveal: this.reveal.kind,
      revealMs: Math.round(this.reveal.elapsedMs),
      hint: this.hand.kind,
      toasts: this.toasts.pending,
      stickers: this.stickers.length,
    };
  }

  /** Точка банки (единицы физики) в логических координатах сцены. */
  jarToScene(x: number, y: number): { x: number; y: number } {
    return { x: this.jarRoot.x + x * this.jarScale, y: this.jarRoot.y + y * this.jarScale };
  }

  debugPlaceKey(tier: number, x: number, y: number, golden = false): void {
    this.createView(this.run.placeKey(tier, x, y, golden));
  }

  debugSetCurrent(tier: number, golden = false): void {
    this.run.setCurrentTier(tier, golden);
    this.showHanging(false);
  }

  /** Повесить над банкой «Карамельку» или «Метеорчик» (автотесты и скриншоты). */
  debugSetSpecial(kind: 'caramel' | 'meteor', tier = 1): void {
    this.run.setCurrentSpecial(kind, tier);
    this.showHanging(false);
  }

  /** Сделать шаги физики сразу, без ожидания кадров (для воспроизводимых скриншотов). */
  debugStep(steps: number): void {
    this.run.stepMany(steps);
    this.renderKeys(1);
    // Шаги прошли мгновенно: пружинки клавиш тоже сразу в покое, иначе кадр зависит от времени.
    this.views.forEach((view) => view.settle());
  }

  /** Остановить физику, оставив отрисовку (для скриншотов). */
  debugFreeze(frozen: boolean): void {
    this.frozen = frozen;
  }

  /** Закончить забег сразу, как при переполнении (для скриншотов экрана результата). */
  debugEndRun(): void {
    this.endRun();
  }
}
