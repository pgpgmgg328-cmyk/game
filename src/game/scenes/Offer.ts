import Phaser from 'phaser';
import type { RewardedResult } from '../../platform';
import { Button } from '../ui/Button';
import { COLORS } from '../ui/theme';
import { BaseScene } from './BaseScene';
import { titleStyle } from './titleStyle';

/** Какое предложение открыто: «Второй шанс» или заряд инструмента. */
export type OfferKind = 'secondChance' | 'shake' | 'remove';

export interface OfferData {
  kind: OfferKind;
  title: string;
  text: string;
  /** Надпись на кнопке рекламы: что именно игрок получит (рядом — значок ▶). */
  watchLabel: string;
  declineLabel: string;
  /** Показать рекламу. Награду выдаёт сам вызывающий — в колбэке onRewarded. */
  watch: () => Promise<RewardedResult>;
  /** Награда получена: окно уже закрыто. */
  onDone: () => void;
  /** Игрок отказался: окно уже закрыто. */
  onDecline: () => void;
}

const PANEL_WIDTH = 600;
const BUTTON_WIDTH = 540;

/**
 * Предложение «за рекламу» поверх забега (CLAUDE.md, «Реклама»): реклама показывается только
 * по нажатию кнопки со значком ▶ и надписью о том, что игрок получит. Отказаться можно всегда.
 * Если реклама недоступна, кнопка так и говорит, а игра идёт дальше.
 */
export class OfferScene extends BaseScene {
  private offer!: OfferData;
  private shade!: Phaser.GameObjects.Rectangle;
  private panel!: Phaser.GameObjects.Graphics;
  private title!: Phaser.GameObjects.Text;
  private text!: Phaser.GameObjects.Text;
  private watchButton!: Button;
  private declineButton!: Button;
  private busy = false;

  constructor() {
    super('Offer');
  }

  get kind(): OfferKind {
    return this.offer.kind;
  }

  create(data: OfferData): void {
    this.setupScreen();
    this.offer = data;
    this.busy = false;
    // Затемнение ловит нажатия, чтобы они не проходили к забегу.
    this.shade = this.add.rectangle(0, 0, 720, 100, COLORS.dim, 0.45).setOrigin(0, 0);
    this.shade.setInteractive();
    this.panel = this.add.graphics();
    this.title = this.createText(360, 0, data.title, titleStyle(52)).setOrigin(0.5);
    this.text = this.createText(360, 0, data.text, {
      fontSize: '34px',
      fontStyle: '800',
      color: COLORS.title,
      align: 'center',
      wordWrap: { width: PANEL_WIDTH - 80, useAdvancedWrap: true },
    }).setOrigin(0.5);
    this.watchButton = new Button(this, 360, 0, {
      id: 'offer.watch',
      label: data.watchLabel,
      icon: 'play',
      width: BUTTON_WIDTH,
      variant: 'primary',
      fontSize: 40,
      onClick: () => void this.watch(),
    });
    this.declineButton = new Button(this, 360, 0, {
      id: 'offer.decline',
      label: data.declineLabel,
      width: BUTTON_WIDTH,
      fontSize: 40,
      onClick: () => this.decline(),
    });
    // Рекламу клавиатурой не включаем: только осознанным нажатием кнопки. Esc/P — отказаться.
    this.onKeyAction((action) => {
      if (action === 'pause') this.decline();
    });
    this.layoutScreen(this.screenHeight);
  }

  protected layoutScreen(height: number): void {
    const { canvasWidth, canvasHeight, column, scale } = this.ctx.layout;
    const shadeWidth = canvasWidth / scale;
    const shadeHeight = canvasHeight / scale;
    this.shade.setPosition(-column.x / scale, -column.y / scale);
    this.shade.setSize(shadeWidth, shadeHeight);
    if (this.shade.input) this.shade.input.hitArea.setSize(shadeWidth, shadeHeight);

    const gap = height < 1000 ? 16 : 26;
    const titleHeight = 96;
    const contentHeight = titleHeight + this.text.height + gap * 3 + 110 * 2;
    const top = Math.max(24, (height - contentHeight) / 2);
    this.panel.clear();
    this.panel.fillStyle(COLORS.panel, 0.96);
    this.panel.fillRoundedRect(
      360 - PANEL_WIDTH / 2,
      top - 28,
      PANEL_WIDTH,
      contentHeight + 56,
      40,
    );
    this.title.setPosition(360, top + titleHeight / 2);
    this.text.setPosition(360, top + titleHeight + gap / 2 + this.text.height / 2);
    const buttonsTop = top + titleHeight + this.text.height + gap * 2;
    this.watchButton.setPosition(360, buttonsTop + 55);
    this.declineButton.setPosition(360, buttonsTop + 110 + gap + 55);
  }

  private async watch(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.watchButton.setDisabled(true);
    this.declineButton.setDisabled(true);
    const result = await this.offer.watch();
    if (!this.sys.isActive()) return;
    if (result === 'rewarded') {
      this.scene.stop();
      this.offer.onDone();
      return;
    }
    this.busy = false;
    this.declineButton.setDisabled(false);
    if (result === 'error') {
      // Реклама не пришла: честно говорим об этом, отказаться по-прежнему можно.
      this.watchButton.setIcon(null).setText(this.ctx.t('ads.unavailable'));
      return;
    }
    // Рекламу закрыли раньше времени: награды нет, но можно попробовать ещё раз.
    this.watchButton.setDisabled(false);
  }

  private decline(): void {
    if (this.busy) return;
    this.busy = true;
    this.scene.stop();
    this.offer.onDecline();
  }
}
