import Phaser from 'phaser';
import { DROP, JAR, SQUISH } from '../../config/balance';
import { actionForKey } from '../../core/input';
import { applyRunResult } from '../../core/run/result';
import type { RunSnapshot } from '../../core/run/snapshot';
import { formatNumber } from '../../i18n';
import { DEFAULT_THEME_ID, THEMES, formOf, getTheme, type ThemeData } from '../../themes';
import { hexToNumber } from '../art/color';
import { ensureFxArt, ensureThemeArt, type KeyArt } from '../art/textures';
import { e2eSeed } from '../e2eParams';
import { DangerLine } from '../objects/DangerLine';
import { AimGuide, JarView } from '../objects/Jar';
import { Keycap } from '../objects/Keycap';
import { Particles } from '../objects/Particles';
import { phaserMatter } from '../run/phaserMatter';
import { Run, type RunEvent, type RunKey } from '../run/Run';
import { Button } from '../ui/Button';
import { COLORS } from '../ui/theme';
import { BaseScene } from './BaseScene';
import { titleStyle } from './titleStyle';

export interface GameSceneData {
  /** Продолжить сохранённый забег. */
  snapshot?: RunSnapshot;
}

/** Что показать на экране результата. */
export interface RunSummary {
  score: number;
  best: number;
  newRecord: boolean;
  bestTier: number;
  world: string;
}

const PAUSE_BUTTON_SIZE = 116;
const NEXT_PANEL_SIZE = 124;
/** Высота полосы HUD над банкой, когда он сверху. */
const HUD_HEIGHT = 172;
/** Самая высокая клавиша, которая может висеть над банкой (тир 5), в единицах физики. */
const MAX_HANG_HEIGHT = 100;
/** Область банки на экране в единицах физики: с висящей клавишей сверху и тенью снизу. */
const VIEW = {
  left: -JAR.wall - 14,
  right: JAR.width + JAR.wall + 14,
  top: -(JAR.hangGap + MAX_HANG_HEIGHT + 26),
  bottom: JAR.height + JAR.wall + 34,
};
/** Сколько длится надпись «Банка переполнена!» перед экраном результата. */
const OVERFLOW_BANNER_MS = 1700;
/** Удары о соседей анимируются не чаще, чем раз в столько миллисекунд на клавишу. */
const IMPACT_COOLDOWN_MS = 140;

interface Gesture {
  pointerId: number;
  kind: 'aim' | 'squish';
}

/**
 * Экран забега: банка с клавишами, прицел, счёт. Физика и правила живут в Run (game/run),
 * сцена рисует их состояние, передаёт ввод и отвечает анимациями.
 * Пока экран открыт, забег активен: площадке уходит GameplayAPI.start(), на паузе — stop().
 */
export class GameScene extends BaseScene {
  private run!: Run;
  private theme!: ThemeData;
  private art: KeyArt[] = [];
  private jarRoot!: Phaser.GameObjects.Container;
  private keysLayer!: Phaser.GameObjects.Container;
  private views = new Map<number, Keycap>();
  private lastImpact = new Map<number, number>();
  private hanging: Keycap | null = null;
  private preview: Keycap | null = null;
  private danger!: DangerLine;
  private guide!: AimGuide;
  private fx!: Particles;
  private pauseButton!: Button;
  private scoreText!: Phaser.GameObjects.Text;
  private bestText!: Phaser.GameObjects.Text;
  private nextPanel!: Phaser.GameObjects.Graphics;
  private nextLabel!: Phaser.GameObjects.Text;
  private banner: Phaser.GameObjects.Container | null = null;
  private gesture: Gesture | null = null;
  private held = new Set<'left' | 'right'>();
  private shownScore = 0;
  private best = 0;
  private jarScale = 1;
  private ending = false;
  private frozen = false;
  private clock = 0;

  constructor() {
    super('Game');
  }

  create(data: GameSceneData = {}): void {
    this.setupScreen();
    this.resetState();
    const { ctx } = this;
    this.theme = getTheme(data.snapshot?.world ?? DEFAULT_THEME_ID) ?? THEMES[0]!;
    this.art = ensureThemeArt(this, this.theme, ctx.lang);
    ensureFxArt(this);
    this.run = new Run(phaserMatter, this.theme, { snapshot: data.snapshot, seed: e2eSeed() });
    this.best = ctx.save.data.stats.bestScore;
    this.shownScore = this.run.score;

    this.buildJar();
    this.buildHud();
    for (const key of this.run.keys) this.createView(key);
    this.showHanging(false);
    this.updatePreview();
    this.updateScore(true);

    this.addCleanup(this.run.on((event) => this.onRunEvent(event)));
    this.addCleanup(() => this.run.destroy());
    this.bindInput();
    this.bindPause();
    this.layoutScreen(this.screenHeight);
  }

  override update(time: number, delta: number): void {
    this.clock = time;
    if (!this.frozen && !this.ending) {
      const direction = (this.held.has('right') ? 1 : 0) - (this.held.has('left') ? 1 : 0);
      if (direction !== 0) this.run.moveAim((direction * DROP.keyboardSpeed * delta) / 1000);
    }
    const alpha = this.frozen ? 1 : this.run.update(delta);
    this.renderKeys(alpha);
    this.renderHanging(time);
    this.danger.tick(time, this.run.dangerMs, this.ctx.reducedMotion);
    this.views.forEach((view) => view.tick(delta, time));
    this.hanging?.tick(delta, time);
    this.preview?.tick(delta, time);
    this.tickScore(delta);
  }

  protected layoutScreen(height: number): void {
    const { layout } = this.ctx;
    const visibleLeft = -layout.column.x / layout.scale;
    const visibleRight = visibleLeft + layout.canvasWidth / layout.scale;
    const viewWidth = VIEW.right - VIEW.left;
    const viewHeight = VIEW.bottom - VIEW.top;

    // HUD сверху, а если экран низкий и по бокам много места (телефон лёжа) — по бокам от банки.
    const topScale = Math.min((720 - 24) / viewWidth, (height - HUD_HEIGHT - 16) / viewHeight);
    const sideRoom = Math.min(-visibleLeft, visibleRight - 720);
    const sideScale =
      sideRoom >= 250 ? Math.min((720 - 24) / viewWidth, (height - 32) / viewHeight) : 0;
    const side = sideScale > topScale * 1.1;
    const scale = side ? sideScale : topScale;
    this.jarScale = scale;

    const freeHeight = side
      ? height - viewHeight * scale
      : height - HUD_HEIGHT - 8 - viewHeight * scale;
    const jarTop = side ? freeHeight / 2 : HUD_HEIGHT + Math.max(0, freeHeight * 0.45);
    this.jarRoot.setScale(scale);
    this.jarRoot.setPosition(
      360 - ((VIEW.left + VIEW.right) / 2) * scale,
      jarTop - VIEW.top * scale,
    );

    const half = NEXT_PANEL_SIZE / 2;
    if (side) {
      const hudX = visibleLeft / 2;
      this.scoreText.setPosition(hudX, height * 0.2);
      this.bestText.setPosition(hudX, height * 0.2 + 64);
      this.placeNextPanel(hudX, height * 0.2 + 150 + half);
      this.pauseButton.setPosition(
        visibleRight - 24 - PAUSE_BUTTON_SIZE / 2,
        24 + PAUSE_BUTTON_SIZE / 2,
      );
    } else {
      this.scoreText.setPosition(360, 62);
      this.bestText.setPosition(360, 124);
      this.placeNextPanel(24 + half, 24 + half);
      this.pauseButton.setPosition(720 - 24 - PAUSE_BUTTON_SIZE / 2, 24 + PAUSE_BUTTON_SIZE / 2);
    }
    this.banner?.setPosition(JAR.width / 2, JAR.height * 0.38);
  }

  // ── Построение экрана ────────────────────────────────────────────────────────────────

  private resetState(): void {
    this.views = new Map();
    this.lastImpact = new Map();
    this.hanging = null;
    this.preview = null;
    this.banner = null;
    this.gesture = null;
    this.held = new Set();
    this.ending = false;
    this.frozen = false;
  }

  private buildJar(): void {
    const jar = new JarView(this, this.run.jar, this.theme.palette);
    this.danger = new DangerLine(this, this.run.jar, this.theme.palette);
    this.guide = new AimGuide(this, this.theme.palette);
    this.fx = new Particles(this, this.ctx.reducedMotion);
    this.keysLayer = new Phaser.GameObjects.Container(this, 0, 0);
    this.jarRoot = this.add.container(0, 0, [
      jar.back,
      this.guide.graphics,
      this.keysLayer,
      this.danger.graphics,
      jar.front,
      this.fx.layer,
    ]);
  }

  private buildHud(): void {
    const { t } = this.ctx;
    this.scoreText = this.createText(360, 0, '0', titleStyle(64)).setOrigin(0.5);
    this.bestText = this.createText(360, 0, '', {
      fontSize: '30px',
      fontStyle: '800',
      color: COLORS.title,
      stroke: '#ffffff',
      strokeThickness: 6,
    }).setOrigin(0.5);
    this.nextPanel = this.add.graphics();
    this.nextLabel = this.createText(0, 0, t('game.next'), {
      fontSize: '22px',
      fontStyle: '800',
      color: COLORS.title,
    }).setOrigin(0.5);
    this.pauseButton = new Button(this, 0, 0, {
      id: 'game.pause',
      icon: 'pause',
      width: PAUSE_BUTTON_SIZE,
      height: PAUSE_BUTTON_SIZE,
      onClick: () => this.openPause(),
    });
  }

  private placeNextPanel(x: number, y: number): void {
    const size = NEXT_PANEL_SIZE;
    this.nextPanel.clear();
    this.nextPanel.fillStyle(0xffffff, 0.75);
    this.nextPanel.fillRoundedRect(x - size / 2, y - size / 2, size, size, 28);
    this.nextPanel.lineStyle(3, COLORS.keySide, 1);
    this.nextPanel.strokeRoundedRect(x - size / 2, y - size / 2, size, size, 28);
    this.nextLabel.setPosition(x, y - size / 2 + 20);
    this.preview?.setPosition(x, y + 12);
  }

  private artFor(tier: number): KeyArt {
    const art = this.art[tier - 1];
    if (!art) throw new Error(`Нет текстуры для тира ${tier}`);
    return art;
  }

  private newKeycap(tier: number): Keycap {
    return new Keycap(this, this.artFor(tier), {
      idle: !this.ctx.reducedMotion,
      random: Math.random,
    });
  }

  private createView(key: RunKey): Keycap {
    const view = this.newKeycap(key.tier);
    view.setPosition(key.body.position.x, key.body.position.y);
    view.setRotation(key.body.angle);
    this.keysLayer.add(view);
    this.views.set(key.id, view);
    return view;
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
  }

  private renderHanging(time: number): void {
    const hanging = this.hanging;
    const ready = hanging !== null && this.run.canDrop && !this.ending;
    if (hanging) {
      const bob = this.ctx.reducedMotion ? 0 : Math.sin(time / 420) * 3;
      hanging.setPosition(this.run.aimX, this.run.hangY() + bob);
    }
    const { height } = this.run.sizeOf(this.run.currentTier);
    const from = this.run.hangY() + height / 2;
    this.guide.draw(this.run.aimX, from, this.surfaceBelow(this.run.aimX), ready);
  }

  /** На какой высоте висящая клавиша встретит верх кучи (для пунктира прицела). */
  private surfaceBelow(x: number): number {
    const half = this.run.sizeOf(this.run.currentTier).width / 2;
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
    const view = this.newKeycap(this.run.currentTier);
    view.setPosition(this.run.aimX, this.run.hangY());
    this.keysLayer.add(view);
    this.hanging = view;
    if (animate && !this.ctx.reducedMotion) {
      view.pop = 0.4;
      this.tweens.add({ targets: view, pop: 1, duration: 220, ease: 'Back.easeOut' });
    }
  }

  private updatePreview(): void {
    this.preview?.destroy();
    const tier = this.run.upcoming[0];
    if (tier === undefined) {
      this.preview = null;
      return;
    }
    const art = this.artFor(tier);
    const view = new Keycap(this, art, { idle: false, random: Math.random });
    view.baseScale = Math.min(1, 74 / Math.max(art.width, art.height));
    view.tick(0, 0);
    this.add.existing(view);
    this.preview = view;
    this.layoutScreen(this.screenHeight);
  }

  private updateScore(immediate: boolean): void {
    if (immediate || this.ctx.reducedMotion) this.shownScore = this.run.score;
    const { t, lang } = this.ctx;
    this.scoreText.setText(formatNumber(this.shownScore, lang));
    // Рекорд растёт вместе с «дотикивающим» счётом, а не раньше него.
    const best = Math.max(this.best, this.shownScore);
    this.bestText.setText(t('game.best', { score: formatNumber(best, lang) }));
    this.bestText.setColor(this.shownScore > this.best && this.best > 0 ? '#e0457b' : COLORS.title);
  }

  /** Счёт «дотикивает» до настоящего за доли секунды. */
  private tickScore(delta: number): void {
    const target = this.run.score;
    if (this.shownScore === target) return;
    const step = Math.max(1, Math.ceil((target - this.shownScore) * Math.min(1, delta / 120)));
    this.shownScore = Math.min(target, this.shownScore + step);
    this.updateScore(false);
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
        break;
      }
      case 'danger':
        this.danger.setWarning(event.warning);
        break;
      case 'gameover':
        this.endRun();
        break;
    }
  }

  private onMerge(event: Extract<RunEvent, { type: 'merge' }>): void {
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
      const view = this.createView(event.created);
      if (!this.ctx.reducedMotion) {
        view.pop = 0.55;
        this.tweens.add({ targets: view, pop: 1, duration: 260, ease: 'Back.easeOut' });
      }
      view.squash(-0.35);
      const tier = event.created.tier;
      const color = hexToNumber(this.artFor(tier).colors.base);
      this.fx.merge(event.x, event.y, color, tier, t('game.clack'), event.score);
      this.ctx.audio.form(formOf(this.theme, tier).sound, event.combo);
    } else {
      this.fx.mega(event.x, event.y, t('game.mega'), event.score);
      this.ctx.audio.mega();
    }
    if (!this.ctx.reducedMotion) {
      this.tweens.killTweensOf(this.scoreText);
      this.scoreText.setScale(1.15);
      this.tweens.add({ targets: this.scoreText, scale: 1, duration: 220, ease: 'Quad.easeOut' });
    }
  }

  // ── Конец забега ─────────────────────────────────────────────────────────────────────

  private endRun(): void {
    if (this.ending) return;
    this.ending = true;
    this.gesture = null;
    this.held.clear();
    this.hanging?.destroy();
    this.hanging = null;
    this.pauseButton.setVisible(false);
    this.pauseButton.disableInteractive();
    this.ctx.pause.setRunActive(false);
    this.ctx.audio.gameOver();

    const { ctx } = this;
    const stats = this.run.getStats();
    const outcome = applyRunResult(ctx.save.data.stats, stats.score, true);
    ctx.save.update((draft) => {
      draft.stats = outcome.stats;
    });
    const summary: RunSummary = {
      score: stats.score,
      best: outcome.stats.bestScore,
      newRecord: outcome.newRecord,
      bestTier: stats.bestTier,
      world: this.theme.id,
    };

    this.banner = this.createBanner(ctx.t('game.overflow'));
    this.jarRoot.add(this.banner);
    this.layoutScreen(this.screenHeight);
    this.time.delayedCall(OVERFLOW_BANNER_MS, () => this.scene.start('Result', summary));
  }

  /** Мягкая надпись поверх банки: без укоров, просто «банка переполнена». */
  private createBanner(text: string): Phaser.GameObjects.Container {
    const label = this.createText(0, 0, text, titleStyle(52), false).setOrigin(0.5);
    const width = Math.min(JAR.width - 20, label.width + 80);
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
        if (over.length > 0 || this.gesture || this.ending || this.frozen) return;
        const point = this.toJar(pointer);
        const slop = pointer.wasTouch ? SQUISH.touchSlop : 0;
        const key = this.run.keyAt(point.x, point.y, slop);
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
      if (this.ending || this.frozen) return;
      const aiming = this.gesture?.kind === 'aim' && this.gesture.pointerId === pointer.id;
      // Мышью прицел ведётся и без нажатия, пальцем — пока палец на экране.
      const hovering = !this.gesture && !pointer.wasTouch && !pointer.isDown;
      if (aiming || hovering) this.run.setAim(this.toJar(pointer).x);
    });
    const release = (pointer: Phaser.Input.Pointer): void => {
      if (!this.gesture || this.gesture.pointerId !== pointer.id) return;
      const { kind } = this.gesture;
      this.gesture = null;
      if (kind === 'aim' && !this.ending && !this.frozen) this.run.drop();
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
      if (event.repeat || this.ending) return;
      if (action === 'drop' && !this.frozen) this.run.drop();
      if (action === 'pause') this.openPause();
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
          // Пока открыт экран паузы, своя кнопка паузы не нужна и не должна выглядывать из-под окна.
          this.pauseButton.setVisible(!pause.isUserPaused && !this.ending);
          if (paused) {
            // Отпущенные во время паузы клавиши и пальцы не должны «залипнуть».
            this.held.clear();
            this.gesture = null;
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

  private openPause(): void {
    if (this.ending) return;
    this.ctx.pause.setUserPaused(true);
    this.scene.launch('Pause');
  }

  // ── Для автотестов (window.__e2e) ────────────────────────────────────────────────────

  /** Состояние забега для проверок. */
  debugState(): {
    keys: { id: number; tier: number; x: number; y: number }[];
    score: number;
    over: boolean;
    ending: boolean;
    current: number;
    upcoming: number[];
    canDrop: boolean;
    danger: boolean;
    aimX: number;
  } {
    return {
      keys: [...this.run.keys].map((key) => ({
        id: key.id,
        tier: key.tier,
        x: key.body.position.x,
        y: key.body.position.y,
      })),
      score: this.run.score,
      over: this.run.over,
      ending: this.ending,
      current: this.run.currentTier,
      upcoming: [...this.run.upcoming],
      canDrop: this.run.canDrop,
      danger: this.run.dangerWarning,
      aimX: this.run.aimX,
    };
  }

  /** Точка банки (единицы физики) в логических координатах сцены. */
  jarToScene(x: number, y: number): { x: number; y: number } {
    return { x: this.jarRoot.x + x * this.jarScale, y: this.jarRoot.y + y * this.jarScale };
  }

  debugPlaceKey(tier: number, x: number, y: number): void {
    this.createView(this.run.placeKey(tier, x, y));
  }

  debugSetCurrent(tier: number): void {
    this.run.setCurrentTier(tier);
    this.showHanging(false);
  }

  /** Сделать шаги физики сразу, без ожидания кадров (для воспроизводимых скриншотов). */
  debugStep(steps: number): void {
    this.run.stepMany(steps);
    this.renderKeys(1);
  }

  /** Остановить физику, оставив отрисовку (для скриншотов). */
  debugFreeze(frozen: boolean): void {
    this.frozen = frozen;
  }
}
