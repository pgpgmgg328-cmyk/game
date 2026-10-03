import type { DecorItem } from '../core/meta/decor';
import { DEFAULT_BACKGROUND, DEFAULT_JAR } from '../core/save/schema';
import type { LocalizedText, ThemeBackdrop, ThemePalette } from './types';

/**
 * Украшения (диздок, разделы 6 и 8): банки и фоны. Это тоже только данные, как миры:
 * новое украшение — новая строка здесь. Правила (что у кого есть) — в core/meta/decor.ts.
 */

/** Узор на стенках банки. */
export type JarPattern = 'rainbow' | 'stripes' | 'stars' | 'clouds';

export interface JarSkin extends DecorItem {
  readonly kind: 'jar';
  readonly name: LocalizedText;
  /** null — стекло в цветах мира. */
  readonly look: {
    readonly glass: string;
    readonly edge: string;
    readonly pattern: JarPattern;
    /** Цвет узора: полосок, звёздочек, облачков. */
    readonly accent: string;
  } | null;
}

export interface BackgroundSkin extends DecorItem {
  readonly kind: 'background';
  readonly name: LocalizedText;
  /** null — фон мира. tile — узор поверх градиента: клавиатура или облака. */
  readonly look: {
    readonly palette: Pick<ThemePalette, 'skyTop' | 'skyBottom' | 'pattern' | 'patternLine'>;
    readonly backdrop: ThemeBackdrop;
    readonly tile: 'keyboard' | 'clouds';
  } | null;
}

/** Банки: обычная, «Радуга» за неделю заданий подряд и три из «Набора украшений». */
export const JAR_SKINS: readonly JarSkin[] = [
  {
    id: DEFAULT_JAR,
    kind: 'jar',
    source: 'default',
    name: { ru: 'Обычная банка', en: 'Classic jar' },
    look: null,
  },
  {
    id: 'rainbow',
    kind: 'jar',
    source: 'streak',
    name: { ru: 'Радуга', en: 'Rainbow' },
    look: { glass: '#ffffff', edge: '#c3a8ff', pattern: 'rainbow', accent: '#ffffff' },
  },
  {
    id: 'candy',
    kind: 'jar',
    source: 'pack',
    name: { ru: 'Леденец', en: 'Candy Cane' },
    look: { glass: '#fff4f7', edge: '#ffc2d1', pattern: 'stripes', accent: '#ff5c84' },
  },
  {
    id: 'stars',
    kind: 'jar',
    source: 'pack',
    name: { ru: 'Звёздочки', en: 'Starry' },
    look: { glass: '#eef0ff', edge: '#7f8cff', pattern: 'stars', accent: '#ffd65c' },
  },
  {
    id: 'cloud',
    kind: 'jar',
    source: 'pack',
    name: { ru: 'Облачко', en: 'Cloudy' },
    look: { glass: '#f2fbff', edge: '#8fd0ff', pattern: 'clouds', accent: '#ffffff' },
  },
];

/** Фоны: фон мира и два из «Набора украшений». */
export const BACKGROUNDS: readonly BackgroundSkin[] = [
  {
    id: DEFAULT_BACKGROUND,
    kind: 'background',
    source: 'default',
    name: { ru: 'Фон мира', en: 'World background' },
    look: null,
  },
  {
    id: 'confetti',
    kind: 'background',
    source: 'pack',
    name: { ru: 'Конфетти', en: 'Confetti' },
    look: {
      palette: {
        skyTop: '#fff0f7',
        skyBottom: '#e6f4ff',
        pattern: '#ffffff',
        patternLine: '#ecc0dc',
      },
      backdrop: { sprinkles: ['#ff7aa8', '#ffcf4d', '#62c9ff', '#7fe0a8', '#b38cff', '#ff9f6b'] },
      tile: 'keyboard',
    },
  },
  {
    id: 'clouds',
    kind: 'background',
    source: 'pack',
    name: { ru: 'Облака', en: 'Clouds' },
    look: {
      palette: {
        skyTop: '#8fd0ff',
        skyBottom: '#e6f6ff',
        pattern: '#ffffff',
        patternLine: '#bfe3ff',
      },
      backdrop: {},
      tile: 'clouds',
    },
  },
];
