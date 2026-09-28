/** Что сейчас разрешено звуку. */
export interface MixInput {
  /** Настройка «Звук». */
  sound: boolean;
  /** Настройка «Музыка». */
  music: boolean;
  /** Звук выключен окружением: вкладка скрыта, фокус потерян, пауза SDK, реклама. */
  systemMuted: boolean;
  /** Игрок уже сделал жест, и AudioContext создан. */
  unlocked: boolean;
}

export interface MixState {
  /** AudioContext должен работать (иначе — suspend). */
  running: boolean;
  /** Громкость эффектов и музыки: 0 или 1, дальше — общий лимитер. */
  sfx: number;
  music: number;
  /** Музыкальная петля играет. */
  musicPlaying: boolean;
}

/**
 * Правила звука (CLAUDE.md, «Звук и фокус»): при скрытии вкладки, потере фокуса, паузе от SDK
 * и на время рекламы весь звук выключен; до первого жеста AudioContext не запускается.
 */
export function mixState(input: MixInput): MixState {
  const running = input.unlocked && !input.systemMuted && (input.sound || input.music);
  return {
    running,
    sfx: input.sound ? 1 : 0,
    music: input.music ? 1 : 0,
    musicPlaying: running && input.music,
  };
}

/**
 * Ограничитель голосов: длинные цепочки слияний не должны оглушать (диздок, раздел 13).
 * Одновременно звучит не больше max голосов; фоновые звуки уступают важным.
 */
export class VoiceLimiter {
  private readonly max: number;
  private ends: number[] = [];

  constructor(max: number) {
    this.max = max;
  }

  /** Можно ли начать звук длиной duration в момент now. important — важный звук (слияние). */
  tryStart(now: number, duration: number, important: boolean): boolean {
    this.ends = this.ends.filter((end) => end > now);
    const limit = important ? this.max : Math.ceil(this.max / 2);
    if (this.ends.length >= limit) return false;
    this.ends.push(now + duration);
    return true;
  }

  get active(): number {
    return this.ends.length;
  }
}
