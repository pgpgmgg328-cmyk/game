/**
 * Пасхалки меню без Phaser: «пианино» из букв логотипа и тайное слово на клавиатуре.
 */

/** Мелодия: все буквы первого ряда логотипа по порядку слева направо. */
export class MelodyTracker {
  private readonly length: number;
  private progress = 0;

  constructor(length: number) {
    this.length = length;
  }

  /**
   * Нажата буква первого ряда с номером index. true — мелодия сыграна целиком
   * (после этого счёт начинается заново). Ошибка сбрасывает мелодию, но нажатие первой
   * буквы сразу начинает её снова.
   */
  press(index: number): boolean {
    if (this.length <= 0) return false;
    if (index === this.progress) this.progress += 1;
    else this.progress = index === 0 ? 1 : 0;
    if (this.progress < this.length) return false;
    this.progress = 0;
    return true;
  }

  /** Нажата буква другого ряда: мелодия прервана. */
  reset(): void {
    this.progress = 0;
  }
}

/**
 * Тайные слова по event.code: «КЛАЦ» на русской раскладке — физические клавиши R, K, F, W,
 * «CLACK» — C, L, A, C, K. Поэтому пасхалка работает при любой раскладке.
 */
export const SECRET_WORDS: readonly (readonly string[])[] = [
  ['KeyR', 'KeyK', 'KeyF', 'KeyW'],
  ['KeyC', 'KeyL', 'KeyA', 'KeyC', 'KeyK'],
];

const LONGEST = Math.max(...SECRET_WORDS.map((word) => word.length));

/** Следит за нажатыми клавишами; press вернёт true, когда набрано тайное слово. */
export class SecretWordTracker {
  private typed: string[] = [];

  press(code: string): boolean {
    this.typed = [...this.typed, code].slice(-LONGEST);
    for (const word of SECRET_WORDS) {
      const tail = this.typed.slice(-word.length);
      if (tail.length === word.length && tail.every((item, index) => item === word[index])) {
        this.typed = [];
        return true;
      }
    }
    return false;
  }
}
