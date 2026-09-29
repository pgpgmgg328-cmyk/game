import Phaser from 'phaser';
import { MelodyTracker } from '../../core/menu/easterEggs';
import {
  LOGO_KEY_SIZE,
  TEXTURE_SCALE,
  ensureLogoArt,
  logoFaceOffset,
  logoKeyTexture,
  logoLetterColor,
} from '../art/textures';
import type { ButtonHost } from '../ui/Button';
import { titleStyle } from '../scenes/titleStyle';

/** Пентатоника до мажора: любые ноты подряд звучат приятно. Второй ряд — октавой ниже. */
const NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51];
const GAP = 8;

interface LetterKey {
  row: number;
  index: number;
  container: Phaser.GameObjects.Container;
  /** Фаза «волны»: буквы покачиваются по очереди. */
  phase: number;
}

export interface LogoCallbacks {
  /** Нажата буква: сыграть ноту. */
  onNote: (freq: number) => void;
  /** Все буквы первого ряда нажаты слева направо — пасхалка «Пианист». */
  onMelody: () => void;
}

/**
 * Логотип меню: название игры из клавиш-букв («СКВИШИ / КЛАВИШИ» или «SQUISHY / KEYS»)
 * и подпись «Мерж до Пробела» под ними. Буквы покачиваются волной, а по нажатию сминаются
 * и играют ноту — получается маленькое пианино.
 */
export class MenuLogo {
  readonly layer: Phaser.GameObjects.Container;
  private readonly scene: ButtonHost;
  private readonly reducedMotion: boolean;
  private readonly callbacks: LogoCallbacks;
  private readonly words: string[];
  private readonly subtitle: Phaser.GameObjects.Text;
  private keys: LetterKey[] = [];
  private keySize = 84;
  private melody: MelodyTracker;
  private baseY = new Map<Phaser.GameObjects.Container, number>();

  /** title — полное название игры «Имя: подпись»: имя идёт на клавиши, подпись — строкой ниже. */
  constructor(scene: ButtonHost, title: string, reducedMotion: boolean, callbacks: LogoCallbacks) {
    this.scene = scene;
    this.reducedMotion = reducedMotion;
    this.callbacks = callbacks;
    ensureLogoArt(scene);
    const [name = title, caption = ''] = title.split(': ');
    this.words = name.toUpperCase().split(' ');
    this.subtitle = scene.createText(360, 0, caption, titleStyle(46), false).setOrigin(0.5);
    this.layer = scene.add.container(0, 0, [this.subtitle]);
    this.melody = new MelodyTracker(this.words[0]?.length ?? 0);
    let colorIndex = 0;
    this.words.forEach((word, row) => {
      [...word].forEach((letter, index) => {
        this.keys.push(this.createKey(letter, row, index, colorIndex));
        colorIndex += 1;
      });
    });
  }

  /** Сколько букв в первом ряду (для автотестов пасхалки). */
  get firstRowLength(): number {
    return this.keys.filter((key) => key.row === 0).length;
  }

  /**
   * Расставить логотип начиная с top. Узкий режим (compact) — все слова в одну строку.
   * Возвращает нижний край логотипа.
   */
  layout(top: number, compact: boolean): number {
    const rows = compact ? [this.words.join(' ')] : this.words;
    const longest = Math.max(...rows.map((row) => row.length));
    this.keySize = Math.min(compact ? 60 : 88, (720 - 32 - GAP * (longest - 1)) / longest);
    const step = this.keySize + GAP;
    let y = top + this.keySize / 2;
    let letterIndex = 0;
    rows.forEach((row) => {
      const width = row.length * step - GAP;
      let x = 360 - width / 2 + this.keySize / 2;
      for (const char of row) {
        if (char !== ' ') {
          const key = this.keys[letterIndex]!;
          key.container.setPosition(x, y).setScale(this.keySize / LOGO_KEY_SIZE);
          this.baseY.set(key.container, y);
          letterIndex += 1;
        }
        x += step;
      }
      y += step;
    });
    // Только размер и обводка: setStyle сбросил бы чёткость текста на плотных экранах.
    const fontSize = compact ? 36 : 46;
    const style = titleStyle(fontSize);
    this.subtitle.setFontSize(fontSize).setStroke(style.stroke ?? '', style.strokeThickness ?? 0);
    this.subtitle.setPosition(360, y - GAP + fontSize * 0.55);
    return this.subtitle.y + fontSize * 0.65;
  }

  tick(timeMs: number): void {
    if (this.reducedMotion) return;
    for (const key of this.keys) {
      const base = this.baseY.get(key.container);
      if (base === undefined) continue;
      key.container.y = base + Math.sin(timeMs / 520 + key.phase) * this.keySize * 0.05;
    }
  }

  /** Нажать букву (и из автотестов): смяться, сыграть ноту, проверить мелодию. */
  press(row: number, index: number): void {
    const key = this.keys.find((item) => item.row === row && item.index === index);
    if (!key) return;
    const notes = row === 0 ? NOTES : NOTES.map((note) => note / 2);
    this.callbacks.onNote(notes[index % notes.length]!);
    this.squash(key.container);
    if (row !== 0) {
      this.melody.reset();
      return;
    }
    if (this.melody.press(index)) this.callbacks.onMelody();
  }

  /** Все буквы подпрыгивают разом (например, когда получено достижение). */
  cheer(): void {
    this.keys.forEach((key, index) => {
      this.scene.time.delayedCall(index * 40, () => this.squash(key.container));
    });
  }

  private createKey(letter: string, row: number, index: number, colorIndex: number): LetterKey {
    const { scene } = this;
    const image = new Phaser.GameObjects.Image(scene, 0, 0, logoKeyTexture(colorIndex));
    image.setScale(1 / TEXTURE_SCALE);
    const text = scene
      .createText(
        0,
        logoFaceOffset(),
        letter,
        { fontSize: '54px', fontStyle: '900', color: logoLetterColor(colorIndex) },
        false,
      )
      .setOrigin(0.5);
    const container = new Phaser.GameObjects.Container(scene, 0, 0, [image, text]);
    container.setSize(LOGO_KEY_SIZE, LOGO_KEY_SIZE);
    container.setInteractive({ cursor: 'pointer' });
    container.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.press(row, index));
    this.layer.add(container);
    return { row, index, container, phase: colorIndex * 0.55 };
  }

  private squash(container: Phaser.GameObjects.Container): void {
    const scale = this.keySize / LOGO_KEY_SIZE;
    this.scene.tweens.killTweensOf(container);
    if (this.reducedMotion) return;
    container.setScale(scale * 1.18, scale * 0.78);
    this.scene.tweens.add({
      targets: container,
      scaleX: scale,
      scaleY: scale,
      duration: 420,
      ease: 'Elastic.easeOut',
    });
  }
}
