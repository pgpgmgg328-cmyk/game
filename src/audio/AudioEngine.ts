import { semitoneRatio } from '../core/run/combo';
import type { Settings } from '../core/save/schema';
import type { SoundData } from '../themes';
import { mixState, VoiceLimiter, type MixInput } from './mix';
import { MusicLoop } from './music';
import {
  playAchievement,
  playCoin,
  playDrop,
  playForm,
  playGameOver,
  playLand,
  playLegendary,
  playMega,
  playNewForm,
  playPoof,
  playRecord,
  playShake,
  playSquish,
  playTick,
  playUi,
  type Voice,
} from './sounds';
import { createNoiseBuffer } from './synth';

/** Громкость музыки относительно эффектов: музыка тихая (диздок, раздел 13). */
const MUSIC_VOLUME = 0.12;
/** Общая громкость до лимитера. */
const MASTER_VOLUME = 0.8;
/** Больше голосов одновременно не звучит: длинные цепочки не оглушают. */
const MAX_VOICES = 10;

type ContextConstructor = new () => AudioContext;

function findAudioContext(): ContextConstructor | null {
  const scope = window as Window & { webkitAudioContext?: ContextConstructor };
  return window.AudioContext ?? scope.webkitAudioContext ?? null;
}

/** События, которые браузер считает жестом игрока: только после них можно включить звук. */
const GESTURE_EVENTS = ['pointerup', 'touchend', 'keydown'] as const;

/**
 * Весь звук игры: синтез на WebAudio, шины эффектов и музыки, лимитер громкости.
 * AudioContext создаётся по первому жесту игрока; при скрытии вкладки, потере фокуса,
 * паузе от SDK и во время рекламы он останавливается (CLAUDE.md, «Звук и фокус»).
 * Любая ошибка звука проглатывается: игра без звука лучше, чем сломанная игра.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private sfx: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private music: MusicLoop | null = null;
  private readonly limiter = new VoiceLimiter(MAX_VOICES);
  private readonly input: MixInput = {
    sound: true,
    music: true,
    systemMuted: false,
    unlocked: false,
  };

  /** Ждать жеста игрока, чтобы создать или возобновить AudioContext. */
  bindUnlock(target: Window): () => void {
    const unlock = (event: Event): void => {
      // Esc браузер не считает жестом, звук по нему не запустится.
      if (event instanceof KeyboardEvent && event.key === 'Escape') return;
      this.unlock();
    };
    GESTURE_EVENTS.forEach((type) => target.addEventListener(type, unlock, { capture: true }));
    return () =>
      GESTURE_EVENTS.forEach((type) => target.removeEventListener(type, unlock, { capture: true }));
  }

  setSettings(settings: Readonly<Settings>): void {
    this.input.sound = settings.sound;
    this.input.music = settings.music;
    this.apply();
  }

  setSystemMuted(muted: boolean): void {
    this.input.systemMuted = muted;
    this.apply();
  }

  /** Звук запущен (для автотестов). */
  get state(): { unlocked: boolean; running: boolean; music: boolean } {
    return {
      unlocked: this.input.unlocked,
      running: this.ctx?.state === 'running',
      music: this.music?.playing ?? false,
    };
  }

  // ── Звуки ────────────────────────────────────────────────────────────────────────────

  /** Появление формы при слиянии. combo — шаг комбо: тон выше на полутон за шаг. */
  form(sound: SoundData, combo: number): void {
    this.play(true, 0.5, (voice) => playForm(voice, sound, semitoneRatio(combo)));
  }

  mega(): void {
    this.play(true, 1.3, playMega);
  }

  squish(tier: number): void {
    this.play(true, 0.2, (voice) => playSquish(voice, tier));
  }

  land(speed: number, tier: number): void {
    this.play(false, 0.1, (voice) => playLand(voice, speed, tier));
  }

  drop(): void {
    this.play(false, 0.1, playDrop);
  }

  ui(): void {
    this.play(true, 0.1, playUi);
  }

  gameOver(): void {
    this.play(true, 0.7, playGameOver);
  }

  record(): void {
    this.play(true, 1.2, playRecord);
  }

  tick(): void {
    this.play(false, 0.03, playTick);
  }

  coin(): void {
    this.play(false, 0.15, playCoin);
  }

  shake(): void {
    this.play(true, 0.45, playShake);
  }

  poof(): void {
    this.play(true, 0.25, playPoof);
  }

  newForm(): void {
    this.play(true, 0.6, playNewForm);
  }

  legendary(): void {
    this.play(true, 2, playLegendary);
  }

  achievement(): void {
    this.play(true, 0.65, playAchievement);
  }

  // ── Внутреннее ───────────────────────────────────────────────────────────────────────

  private unlock(): void {
    if (!this.ctx) {
      const Context = findAudioContext();
      if (!Context) return;
      try {
        const ctx = new Context();
        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -18;
        compressor.knee.value = 12;
        compressor.ratio.value = 6;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.25;
        const master = ctx.createGain();
        master.gain.value = MASTER_VOLUME;
        master.connect(compressor);
        compressor.connect(ctx.destination);
        this.sfx = ctx.createGain();
        this.sfx.connect(master);
        this.musicBus = ctx.createGain();
        this.musicBus.gain.value = 0;
        this.musicBus.connect(master);
        this.noiseBuffer = createNoiseBuffer(ctx);
        this.music = new MusicLoop(ctx, this.musicBus);
        this.ctx = ctx;
        this.input.unlocked = true;
      } catch {
        return;
      }
    }
    this.apply();
  }

  private apply(): void {
    const { ctx, sfx, musicBus, music } = this;
    if (!ctx || !sfx || !musicBus || !music) return;
    const state = mixState(this.input);
    try {
      sfx.gain.setTargetAtTime(state.sfx, ctx.currentTime, 0.01);
      musicBus.gain.setTargetAtTime(state.music * MUSIC_VOLUME, ctx.currentTime, 0.05);
      if (state.running && ctx.state !== 'running') void ctx.resume().catch(() => undefined);
      if (!state.running && ctx.state === 'running') void ctx.suspend().catch(() => undefined);
    } catch {
      // Звук необязателен: сбой WebAudio не должен ломать игру.
    }
    if (state.musicPlaying) music.start();
    else music.stop();
  }

  private play(important: boolean, duration: number, render: (voice: Voice) => number): void {
    const { ctx, sfx, noiseBuffer } = this;
    if (!ctx || !sfx || !noiseBuffer || ctx.state !== 'running') return;
    const state = mixState(this.input);
    if (!state.running || state.sfx === 0) return;
    if (!this.limiter.tryStart(ctx.currentTime, duration, important)) return;
    try {
      render({ ctx, out: sfx, noise: noiseBuffer });
    } catch {
      // Звук необязателен: сбой WebAudio не должен ломать игру.
    }
  }
}
