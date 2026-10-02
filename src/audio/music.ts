import type { MusicData } from '../themes';
import { tone } from './synth';

/** Частота ноты по номеру MIDI (69 — ля первой октавы, 440 Гц). */
export function midiToFrequency(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

/** Длительность восьмой ноты песни, с. */
export function stepSeconds(song: MusicData): number {
  return 60 / song.bpm / 2;
}

/**
 * Тихая музыкальная петля мира (диздок, раздел 13): у каждого мира свой мотив в themes/.
 * Ноты планируются чуть заранее по часам AudioContext.
 */
export class MusicLoop {
  private readonly ctx: BaseAudioContext;
  private readonly out: AudioNode;
  private song: MusicData;
  private timer: number | null = null;
  private step = 0;
  private nextTime = 0;

  constructor(ctx: BaseAudioContext, out: AudioNode, song: MusicData) {
    this.ctx = ctx;
    this.out = out;
    this.song = song;
  }

  get playing(): boolean {
    return this.timer !== null;
  }

  /** Сменить мотив (сменился мир): новый начинается с начала, со следующей восьмой. */
  setSong(song: MusicData): void {
    if (song === this.song) return;
    this.song = song;
    this.step = 0;
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
      this.nextTime += stepSeconds(this.song);
      this.step = (this.step + 1) % Math.max(1, this.song.melody.length);
    }
  }

  private playStep(step: number, at: number): void {
    const { melody, bass, wave, decay } = this.song;
    const note = melody[step];
    if (note !== null && note !== undefined) {
      tone(this.ctx, this.out, {
        type: wave,
        freq: midiToFrequency(note),
        attack: 0.01,
        decay,
        // Квадратная волна громче остальных: её делаем тише.
        gain: wave === 'square' ? 0.25 : 0.5,
        lowpass: wave === 'square' ? 2400 : undefined,
        at,
      });
    }
    if (step % 4 === 0) {
      const root = bass[(step / 4) % Math.max(1, bass.length)];
      if (root !== undefined) {
        tone(this.ctx, this.out, {
          freq: midiToFrequency(root),
          attack: 0.02,
          decay: 0.6,
          gain: 0.6,
          at,
        });
      }
    }
  }
}
