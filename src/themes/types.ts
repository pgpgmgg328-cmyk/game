import type { Lang } from '../i18n';

/**
 * Мир — это только данные: формы клавиш, их имена, надписи, цвета, лица, звуки и физика.
 * Новый мир — новый файл рядом, без правок движка (CLAUDE.md, «Архитектура»).
 */

/** Текст на обоих языках игры. */
export type LocalizedText = Readonly<Record<Lang, string>>;

/** Значки, которых нет в шрифте: их рисует код. */
export type KeyGlyph = 'backspace' | 'crown';

/** Надпись в углу клавиши: текст (может зависеть от языка) или нарисованный значок. */
export type KeyLabel =
  | { readonly kind: 'text'; readonly text: string | LocalizedText }
  | { readonly kind: 'glyph'; readonly glyph: KeyGlyph };

/** Окраска верхней грани: один цвет или радужный перелив слева направо. */
export type KeyPaint =
  | { readonly kind: 'solid'; readonly color: string }
  | { readonly kind: 'rainbow'; readonly colors: readonly string[] };

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

/** Вид звука при появлении формы (диздок, таблица форм, колонка «Звук»). */
export type MergeSoundKind = 'pik' | 'tuk' | 'chpok' | 'clack' | 'whoosh' | 'fanfare';

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
  readonly label: KeyLabel;
  /** Размер в U, где U — ширина банки / 12. */
  readonly size: { readonly w: number; readonly h: number };
  readonly paint: KeyPaint;
  readonly face: FaceData;
  readonly sound: SoundData;
}

/** Физика мира. Трение, демпфирование и прочее общее — в config/balance.ts. */
export interface WorldPhysics {
  /** Упругость клавиш (restitution). */
  readonly restitution: number;
  /** Множитель силы тяжести. */
  readonly gravityScale: number;
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
}

export interface ThemeData {
  /** Постоянный латинский идентификатор мира (в сохранениях и именах текстур). */
  readonly id: string;
  readonly name: LocalizedText;
  readonly physics: WorldPhysics;
  readonly palette: ThemePalette;
  /** Формы по порядку тиров, от маленькой к Пробелу. */
  readonly forms: readonly FormData[];
}
