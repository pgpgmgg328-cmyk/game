import type { Lang } from '../i18n';

/**
 * Мир — это только данные: формы клавиш, их имена, надписи, цвета, лица, звуки и физика.
 * Новый мир — новый файл рядом, без правок движка (CLAUDE.md, «Архитектура»).
 */

/** Текст на обоих языках игры. */
export type LocalizedText = Readonly<Record<Lang, string>>;

/** Значки, которых нет в шрифте: их рисует код. */
export type KeyGlyph = 'backspace' | 'crown' | 'heart';

/** Надпись в углу клавиши: текст (может зависеть от языка) или нарисованный значок. */
export type KeyLabel =
  | { readonly kind: 'text'; readonly text: string | LocalizedText }
  | { readonly kind: 'glyph'; readonly glyph: KeyGlyph };

/** Окраска верхней грани: один цвет или радужный перелив слева направо. */
export type KeyPaint =
  | { readonly kind: 'solid'; readonly color: string }
  | { readonly kind: 'rainbow'; readonly colors: readonly string[] };

/**
 * Отделка колпачка: пластик (мир 1), мармелад — полупрозрачный и блестящий (мир 2),
 * космос — тёмный корпус со светящимся краем (мир 3).
 */
export type KeyFinish = 'plastic' | 'jelly' | 'cosmic';

/**
 * Узор поверх цвета клавиши. Лицо и надпись остаются чистыми: узор жмётся к краям.
 * sprinkles — посыпка, drizzle — полоски глазури, chips — шоколадная крошка, stripes — полоски
 * леденца на боку, drips — глазурь стекает с верха, cherry — вишенка в углу, stars — звёздочки,
 * craters — кратеры, rings — кольцо планеты, swirl — завиток галактики.
 */
export type KeyDecor =
  | 'sprinkles'
  | 'drizzle'
  | 'chips'
  | 'stripes'
  | 'drips'
  | 'cherry'
  | 'stars'
  | 'craters'
  | 'rings'
  | 'swirl';

export type EyeStyle =
  /** Обычные круглые глаза с бликом. */
  | 'round'
  /** Большие круглые — удивление, восторг. */
  | 'big'
  /** Зажмуренные дуги «^ ^» — радость. */
  | 'happy'
  /** Один глаз открыт, второй подмигивает. */
  | 'wink'
  /** Полуприкрытые — сонные. */
  | 'sleepy'
  /** Смотрят вниз и в сторону — стесняется. */
  | 'shy'
  /** Прищур — хитрый. */
  | 'sly'
  /** Звёздочки — легендарный восторг. */
  | 'star';

export type BrowStyle = 'none' | 'raised' | 'sly' | 'worried' | 'proud' | 'cheeky';

/** Шесть вариантов рта (диздок, раздел 12). */
export type MouthStyle = 'o' | 'smile' | 'grin' | 'smirk' | 'shout' | 'wavy';

export type FaceExtra = 'glasses' | 'zzz' | 'tongue' | 'sparkles';

export interface FaceData {
  readonly eyes: EyeStyle;
  readonly brows: BrowStyle;
  readonly mouth: MouthStyle;
  readonly blush: boolean;
  readonly extras?: readonly FaceExtra[];
}

/**
 * Вид звука при появлении формы (диздок, таблица форм, колонка «Звук»). boing — пружинка
 * мармелада, bloop — пузырёк, twinkle — космический колокольчик.
 */
export type MergeSoundKind =
  'pik' | 'tuk' | 'chpok' | 'clack' | 'whoosh' | 'fanfare' | 'boing' | 'bloop' | 'twinkle';

export interface SoundData {
  readonly kind: MergeSoundKind;
  /** Основной тон, Гц. С ростом тира тон понижается. */
  readonly pitch: number;
  /** Громкость 0…1 до общего лимитера. */
  readonly volume: number;
  /** Задержка эха в секундах; нет — без эха. */
  readonly echo?: number;
}

export interface FormData {
  /** Номер формы: 1…11. */
  readonly tier: number;
  readonly name: LocalizedText;
  /** Смешная подпись в альбоме, одна короткая строка (диздок, раздел 6). */
  readonly caption: LocalizedText;
  readonly label: KeyLabel;
  /** Размер в U, где U — ширина банки / 12. */
  readonly size: { readonly w: number; readonly h: number };
  readonly paint: KeyPaint;
  /** Отделка; по умолчанию — отделка мира. */
  readonly finish?: KeyFinish;
  readonly decor?: KeyDecor;
  readonly face: FaceData;
  readonly sound: SoundData;
}

/**
 * Особые клавиши мира (диздок, раздел 5). Это тоже модификаторы мира, поэтому их числа
 * живут в данных мира, как упругость и гравитация.
 */
export interface WorldSpecials {
  /**
   * «Карамелька»: обычная клавиша в карамели. Коснувшись стенки банки, держится за неё
   * holdMs, потом отлипает и дальше ведёт себя как обычная. chance — доля таких клавиш.
   */
  readonly caramel?: { readonly chance: number; readonly holdMs: number };
  /**
   * «Метеорчик»: раз в everyMs игры вместо клавиши. Игрок направляет его как обычно;
   * клавиша, в которую он попал, мягко исчезает с блёстками. size — диаметр в U.
   */
  readonly meteor?: { readonly everyMs: number; readonly size: number };
}

/** Физика мира. Трение, демпфирование и прочее общее — в config/balance.ts. */
export interface WorldPhysics {
  /** Упругость клавиш (restitution). */
  readonly restitution: number;
  /** Множитель силы тяжести. */
  readonly gravityScale: number;
}

/**
 * Музыка мира: короткий лёгкий мотив в петле (диздок, раздел 13). Ноты — номера MIDI
 * (60 — до первой октавы), null — пауза; мелодия — восьмыми, бас — по ноте на четыре восьмых.
 */
export interface MusicData {
  /** Удары в минуту (восьмая — половина удара). */
  readonly bpm: number;
  readonly melody: readonly (number | null)[];
  readonly bass: readonly number[];
  /** Тембр мелодии. */
  readonly wave: 'sine' | 'triangle' | 'square';
  /** Сколько звучит нота мелодии, с. */
  readonly decay: number;
}

/** Украшения фона мира поверх градиента: звёздочки или цветная посыпка. */
export interface ThemeBackdrop {
  readonly stars?: string;
  readonly sprinkles?: readonly string[];
}

/** Цвета банки и линий мира. */
export interface ThemePalette {
  /** Стекло банки. */
  readonly glass: string;
  /** Края и дно банки. */
  readonly glassEdge: string;
  /** Линия опасности. */
  readonly danger: string;
  /** Пунктир прицела под висящей клавишей. */
  readonly guide: string;
  /** Цвет лиц: глаза, брови, рот. */
  readonly face: string;
  /** Фон: верх и низ мягкого градиента (диздок, раздел 12). */
  readonly skyTop: string;
  readonly skyBottom: string;
  /** Узор клавиатуры на фоне: заливка клавиш и их контур. */
  readonly pattern: string;
  readonly patternLine: string;
}

export interface ThemeData {
  /** Постоянный латинский идентификатор мира (в сохранениях и именах текстур). */
  readonly id: string;
  readonly name: LocalizedText;
  /** Короткое имя для вкладок альбома. */
  readonly shortName: LocalizedText;
  /** Чем мир особенный — одна короткая строка для экрана «Миры». */
  readonly about: LocalizedText;
  readonly physics: WorldPhysics;
  readonly specials: WorldSpecials;
  /** Отделка клавиш мира (форма может задать свою). */
  readonly finish: KeyFinish;
  readonly palette: ThemePalette;
  readonly backdrop: ThemeBackdrop;
  readonly music: MusicData;
  /** Формы по порядку тиров, от маленькой к Пробелу. */
  readonly forms: readonly FormData[];
}
