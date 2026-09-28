import { tone } from './synth';

/** Частота ноты по номеру MIDI (69 — ля первой октавы, 440 Гц). */
export function midiToFrequency(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

/** Восьмая нота при темпе 104 удара в минуту. */
export const MUSIC_STEP_SECONDS = 60 / 104 / 2;

/**
 * Мелодия: две фразы по 16 восьмых в до-мажорной пентатонике, null — пауза.
 * Короткий лёгкий мотив, который не надоедает в петле (диздок, раздел 13).
 */
export const MELODY: readonly (number | null)[] = [
  72,
  null,
  76,
  79,
  81,
  null,
  79,
  76,
  74,
  null,
  76,
  79,
  76,
  null,
  72,
  null,
  74,
  null,
  76,
  79,
  84,
  null,
  81,
  79,
  76,
  null,
  74,
  76,
  72,
  null,
  null,
  null,
];

/** Бас: одна нота на каждые 4 восьмые. */
export const BASS: readonly number[] = [48, 48, 45, 45, 41, 41, 43, 43];

/** Тихая музыкальная петля. Ноты планируются чуть заранее по часам AudioContext. */
export class MusicLoop {
  private readonly ctx: BaseAudioContext;
  private readonly out: AudioNode;
  private timer: number | null = null;
  private step = 0;
  private nextTime = 0;

  constructor(ctx: BaseAudioContext, out: AudioNode) {
    this.ctx = ctx;
    this.out = out;
  }

  get playing(): boolean {
    return this.timer !== null;
  }

  start(): void {
    if (this.timer !== null) return;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 50);
    this.schedule();
  }

  stop(): void {
    if (this.timer === null) return;
    window.clearInterval(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    // Пока AudioContext на паузе, его часы стоят — лишние ноты не накапливаются.
    const horizon = this.ctx.currentTime + 0.25;
    while (this.nextTime < horizon) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += MUSIC_STEP_SECONDS;
      this.step = (this.step + 1) % MELODY.length;
    }
  }

  private playStep(step: number, at: number): void {
    const note = MELODY[step];
    if (note !== null && note !== undefined) {
      tone(this.ctx, this.out, {
        type: 'triangle',
        freq: midiToFrequency(note),
        attack: 0.01,
        decay: 0.3,
        gain: 0.5,
        at,
      });
    }
    if (step % 4 === 0) {
      const bass = BASS[(step / 4) % BASS.length];
      if (bass !== undefined) {
        tone(this.ctx, this.out, {
          freq: midiToFrequency(bass),
          attack: 0.02,
          decay: 0.6,
          gain: 0.6,
          at,
        });
      }
    }
  }
}
