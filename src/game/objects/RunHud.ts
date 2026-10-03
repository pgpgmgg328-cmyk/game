import Phaser from 'phaser';
import { formatNumber, type Lang, type Translate } from '../../i18n';
import { UI_ART, type KeyArt } from '../art/textures';
import { titleStyle } from '../scenes/titleStyle';
import { Button, type ButtonHost } from '../ui/Button';
import { COLORS } from '../ui/theme';
import { Keycap } from './Keycap';
import { MeteorView } from './Meteor';

/** HUD над банкой («top») или по бокам от неё, когда экран низкий и широкий («side»). */
export type HudMode = 'top' | 'side';

/** Что показать в «Далее»: клавишу (может быть в карамельной глазури) или «Метеорчик» (диаметр). */
export type HudPreview = { art: KeyArt; caramel: string | null } | { meteor: number };

/** Какие инструменты есть в этом забеге (куплены апгрейды или остались заряды). */
export interface HudTools {
  shake: boolean;
  remove: boolean;
}

export interface HudActions {
  onPause: () => void;
  onShake: () => void;
  onRemove: () => void;
}

/** Высота полосы HUD над банкой. */
export const HUD_TOP_HEIGHT = 172;
/** Полоса инструментов под банкой в портретном режиме. */
export const HUD_TOOLS_HEIGHT = 142;
/** Сколько места нужно сбоку от колонки, чтобы HUD встал по бокам. */
export const HUD_SIDE_ROOM = 250;

const PAUSE_SIZE = 116;
const NEXT_SIZE = 124;
/** Панель «Далее» на две клавиши (апгрейд «+1 к предпросмотру»). */
const NEXT_WIDE = 204;
const TOOL_WIDTH = 250;
const TOOL_HEIGHT = 110;
const COIN_ICON = 38;
/** Самая большая клавиша в окошке «Далее», в логических пикселях. */
const PREVIEW_SIZE = 74;
const PREVIEW_SMALL = 52;

/**
 * Всё, что вокруг банки: счёт, рекорд, монеты забега, окошко «Далее», пауза и кнопки
 * «Встряска» и «Удаление» с числом зарядов (диздок, раздел 9).
 */
export class RunHud {
  readonly pause: Button;
  readonly shake: Button | null;
  readonly remove: Button | null;
  private readonly scene: ButtonHost;
  private readonly t: Translate;
  private readonly lang: Lang;
  private readonly slots: number;
  private readonly score: Phaser.GameObjects.Text;
  private readonly best: Phaser.GameObjects.Text;
  private readonly coinIcon: Phaser.GameObjects.Image;
  private readonly coins: Phaser.GameObjects.Text;
  private readonly nextPanel: Phaser.GameObjects.Graphics;
  private readonly nextLabel: Phaser.GameObjects.Text;
  /** Клавиши в окошке «Далее» живут в своём слое, чтобы не перекрывать то, что выше HUD. */
  private readonly previewLayer: Phaser.GameObjects.Container;
  private previews: (Keycap | MeteorView)[] = [];
  private mode: HudMode = 'top';
  private nextArea = { x: 0, y: 0, width: NEXT_SIZE, height: NEXT_SIZE };
  private scoreCenter = { x: 360, y: 62 };
  private lineY = 124;
  private lineRoom = 400;
  /** Масштаб монетки счётчика в покое (после подгонки строки по ширине). */
  private coinScale = 1;

  constructor(
    scene: ButtonHost,
    t: Translate,
    lang: Lang,
    slots: number,
    tools: HudTools,
    actions: HudActions,
  ) {
    this.scene = scene;
    this.t = t;
    this.lang = lang;
    this.slots = Math.max(1, Math.min(2, slots));
    this.score = scene.createText(360, 0, '0', titleStyle(64)).setOrigin(0.5);
    const lineStyle = {
      fontSize: '30px',
      fontStyle: '800',
      color: COLORS.title,
      stroke: '#ffffff',
      strokeThickness: 6,
    };
    this.best = scene.createText(0, 0, '', lineStyle).setOrigin(0, 0.5);
    this.coinIcon = scene.add.image(0, 0, UI_ART.coin).setDisplaySize(COIN_ICON, COIN_ICON);
    this.coins = scene.createText(0, 0, '0', lineStyle).setOrigin(0, 0.5);
    this.nextPanel = scene.add.graphics();
    this.nextLabel = scene
      .createText(0, 0, t('game.next'), { fontSize: '22px', fontStyle: '800', color: COLORS.title })
      .setOrigin(0.5);
    this.previewLayer = scene.add.container(0, 0);
    this.pause = new Button(scene, 0, 0, {
      id: 'game.pause',
      icon: 'pause',
      width: PAUSE_SIZE,
      height: PAUSE_SIZE,
      onClick: actions.onPause,
    });
    const tool = (id: string, icon: 'shake' | 'remove', onClick: () => void): Button =>
      new Button(scene, 0, 0, {
        id,
        icon,
        label: t(id === 'game.shake' ? 'game.shake' : 'game.remove'),
        width: TOOL_WIDTH,
        height: TOOL_HEIGHT,
        fontSize: 32,
        onClick,
      });
    this.shake = tools.shake ? tool('game.shake', 'shake', actions.onShake) : null;
    this.remove = tools.remove ? tool('game.remove', 'remove', actions.onRemove) : null;
  }

  get hasTools(): boolean {
    return this.shake !== null || this.remove !== null;
  }

  /** Счёт, рекорд (растёт вместе со счётом) и подсветка, когда рекорд побит. */
  setScore(score: number, best: number, beating: boolean): void {
    this.score.setText(formatNumber(score, this.lang));
    this.best.setText(this.t('game.best', { score: formatNumber(best, this.lang) }));
    this.best.setColor(beating ? '#e0457b' : COLORS.title);
    this.placeLine();
  }

  setCoins(value: number): void {
    this.coins.setText(formatNumber(value, this.lang));
    this.placeLine();
  }

  /** Счёт подпрыгивает при слиянии. */
  bumpScore(): void {
    this.bump(this.score, 1, 1.15);
  }

  /** Монетка подпрыгивает, когда в неё долетает монета. */
  bumpCoins(): void {
    this.bump(this.coinIcon, this.coinScale, 1.3);
  }

  /** Где монетка счётчика: сюда летят монеты. */
  coinTarget(): { x: number; y: number } {
    return { x: this.coinIcon.x, y: this.coinIcon.y };
  }

  /**
   * Следующие клавиши: первая крупно, вторая (с апгрейдом) — поменьше. «Карамелька» — в глазури,
   * «Метеорчик» — сам собой: игрок заранее видит, что упадёт.
   */
  setPreview(items: readonly HudPreview[]): void {
    this.previews.forEach((view) => view.destroy());
    this.previews = items.slice(0, this.slots).map((item, index) => {
      const size = index === 0 ? PREVIEW_SIZE : PREVIEW_SMALL;
      let view: Keycap | MeteorView;
      if ('meteor' in item) {
        view = new MeteorView(this.scene, item.meteor, false).setTail(false);
        view.baseScale = Math.min(1, size / item.meteor);
      } else {
        view = new Keycap(this.scene, item.art, { idle: false, random: Math.random });
        if (item.caramel) view.setCaramel(item.caramel);
        view.baseScale = Math.min(1, size / Math.max(item.art.width, item.art.height));
      }
      view.tick(0, 0);
      this.previewLayer.add(view);
      return view;
    });
    this.placePreviews();
  }

  /**
   * Заряды инструментов. offers — заряды кончились, но ещё один можно получить за рекламу:
   * тогда кнопка не бледнеет, а в углу вместо нуля значок «▶».
   */
  setCharges(shakes: number, removes: number, offers: HudTools): void {
    RunHud.setTool(this.shake, shakes, offers.shake);
    RunHud.setTool(this.remove, removes, offers.remove);
  }

  /** Кнопки паузы и инструментов: на время «Второго шанса» прячутся и не нажимаются. */
  setControlsVisible(visible: boolean): void {
    for (const button of [this.pause, this.shake, this.remove]) {
      if (!button) continue;
      button.setVisible(visible);
      if (visible) button.setInteractive();
      else button.disableInteractive();
    }
  }

  private static setTool(button: Button | null, charges: number, offer: boolean): void {
    if (!button) return;
    if (charges > 0) button.setBadge(charges).setDisabled(false);
    else if (offer) button.setAdBadge().setDisabled(false);
    else button.setBadge(0).setDisabled(true);
  }

  setRemoveMode(on: boolean): void {
    this.remove?.setHighlighted(on);
  }

  /** Конец забега: кнопки прячутся и больше не нажимаются. */
  hideControls(): void {
    for (const button of [this.pause, this.shake, this.remove]) {
      button?.setVisible(false);
      button?.disableInteractive();
    }
  }

  /**
   * Расставить HUD. height — высота колонки; visibleLeft/visibleRight — края видимой области
   * в координатах колонки; jarBottom — нижний край банки (под ним полоса инструментов).
   */
  layout(
    mode: HudMode,
    height: number,
    visibleLeft: number,
    visibleRight: number,
    jarBottom: number,
  ): void {
    this.mode = mode;
    const nextWidth = this.slots === 2 ? NEXT_WIDE : NEXT_SIZE;
    if (mode === 'side') {
      const hudX = visibleLeft / 2;
      const top = Math.max(24, height * 0.14);
      this.scoreCenter = { x: hudX, y: top + 30 };
      this.score.setPosition(hudX, top + 30);
      this.lineY = top + 96;
      this.lineRoom = Math.max(160, -visibleLeft - 32);
      this.nextArea = {
        x: hudX - nextWidth / 2,
        y: top + 196,
        width: nextWidth,
        height: NEXT_SIZE,
      };
      const rightX = (720 + visibleRight) / 2;
      this.pause.setPosition(visibleRight - 24 - PAUSE_SIZE / 2, 24 + PAUSE_SIZE / 2);
      const toolWidth = Math.min(TOOL_WIDTH, visibleRight - 720 - 24);
      const tools = [this.shake, this.remove].filter((button): button is Button => button !== null);
      tools.forEach((button, index) => {
        button.setButtonSize(toolWidth, TOOL_HEIGHT);
        const offset = (index - (tools.length - 1) / 2) * (TOOL_HEIGHT + 24);
        button.setPosition(rightX, height * 0.55 + offset);
      });
    } else {
      const panelRight = 24 + nextWidth;
      const pauseLeft = 720 - 24 - PAUSE_SIZE;
      const centerX = (panelRight + pauseLeft) / 2;
      this.scoreCenter = { x: centerX, y: 62 };
      this.score.setPosition(centerX, 62);
      this.lineY = 124;
      this.lineRoom = pauseLeft - panelRight - 16;
      this.nextArea = { x: 24, y: 24, width: nextWidth, height: NEXT_SIZE };
      this.pause.setPosition(720 - 24 - PAUSE_SIZE / 2, 24 + PAUSE_SIZE / 2);
      const tools = [this.shake, this.remove].filter((button): button is Button => button !== null);
      const y = Math.min(height - TOOL_HEIGHT / 2 - 12, jarBottom + 16 + TOOL_HEIGHT / 2);
      tools.forEach((button, index) => {
        button.setButtonSize(TOOL_WIDTH, TOOL_HEIGHT);
        const offset = (index - (tools.length - 1) / 2) * (TOOL_WIDTH + 24);
        button.setPosition(360 + offset, y);
      });
    }
    this.drawNextPanel();
    this.placePreviews();
    this.placeLine();
  }

  private drawNextPanel(): void {
    const { x, y, width, height } = this.nextArea;
    const g = this.nextPanel;
    g.clear();
    g.fillStyle(0xffffff, 0.75);
    g.fillRoundedRect(x, y, width, height, 28);
    g.lineStyle(3, COLORS.keySide, 1);
    g.strokeRoundedRect(x, y, width, height, 28);
    this.nextLabel.setPosition(x + width / 2, y + 20);
  }

  private placePreviews(): void {
    const { x, y, width, height } = this.nextArea;
    const centerY = y + height / 2 + 12;
    if (this.previews.length === 1 || this.slots === 1) {
      this.previews[0]?.setPosition(x + width / 2, centerY);
      return;
    }
    this.previews[0]?.setPosition(x + 62, centerY);
    this.previews[1]?.setPosition(x + width - 50, centerY + 6);
  }

  /** Строка под счётом: рекорд и монеты забега. Не помещается — уменьшается. */
  private placeLine(): void {
    const gap = 22;
    if (this.mode === 'side') {
      // Сбоку места мало по ширине: рекорд и монеты — две строки.
      const fitBest = Math.min(1, this.lineRoom / this.best.width);
      this.best.setScale(fitBest).setOrigin(0.5).setPosition(this.scoreCenter.x, this.lineY);
      const width = COIN_ICON + 8 + this.coins.width;
      const left = this.scoreCenter.x - width / 2;
      this.coinIcon.setDisplaySize(COIN_ICON, COIN_ICON);
      this.coinIcon.setPosition(left + COIN_ICON / 2, this.lineY + 50);
      this.coinScale = this.coinIcon.scaleX;
      this.coins
        .setScale(1)
        .setOrigin(0, 0.5)
        .setPosition(left + COIN_ICON + 8, this.lineY + 50);
      return;
    }
    const width = this.best.width + gap + COIN_ICON + 8 + this.coins.width;
    const fit = Math.min(1, this.lineRoom / width);
    const left = this.scoreCenter.x - (width * fit) / 2;
    this.best.setScale(fit).setOrigin(0, 0.5).setPosition(left, this.lineY);
    const iconX = left + (this.best.width + gap + COIN_ICON / 2) * fit;
    this.coinIcon.setDisplaySize(COIN_ICON * fit, COIN_ICON * fit).setPosition(iconX, this.lineY);
    this.coinScale = this.coinIcon.scaleX;
    this.coins
      .setScale(fit)
      .setOrigin(0, 0.5)
      .setPosition(iconX + (COIN_ICON / 2 + 8) * fit, this.lineY);
  }

  private bump(
    target: Phaser.GameObjects.Text | Phaser.GameObjects.Image,
    rest: number,
    amount: number,
  ): void {
    const { tweens } = this.scene;
    tweens.killTweensOf(target);
    target.setScale(rest * amount);
    tweens.add({ targets: target, scale: rest, duration: 220, ease: 'Quad.easeOut' });
  }
}
