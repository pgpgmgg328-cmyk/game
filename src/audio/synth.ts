/**
 * Кирпичики синтеза на WebAudio: тон с огибающей и короткий шум через фильтр.
 * Всё звучит коротко и тихо, общую громкость держит лимитер в AudioEngine.
 */

export interface ToneOptions {
  type?: OscillatorType;
  freq: number;
  /** Частота в конце звука (скольжение тона). */
  freqEnd?: number;
  /** Сколько длится скольжение, с; по умолчанию — весь звук. */
  glide?: number;
  attack?: number;
  decay: number;
  gain: number;
  /** Смещение начала от «сейчас», с. */
  delay?: number;
  /** Точное время начала по часам AudioContext (для музыки); тогда delay не нужен. */
  at?: number;
  /** Вибрато: частота (Гц) и глубина (доля частоты). */
  vibrato?: { rate: number; depth: number };
  /** Фильтр нижних частот, Гц. */
  lowpass?: number;
}

export interface NoiseOptions {
  filter: BiquadFilterType;
  freq: number;
  freqEnd?: number;
  q?: number;
  attack?: number;
  decay: number;
  gain: number;
  delay?: number;
}

const MIN_GAIN = 0.0001;

function envelope(
  ctx: BaseAudioContext,
  start: number,
  attack: number,
  decay: number,
  gain: number,
): GainNode {
  const node = ctx.createGain();
  node.gain.setValueAtTime(MIN_GAIN, start);
  node.gain.exponentialRampToValueAtTime(Math.max(MIN_GAIN, gain), start + attack);
  node.gain.exponentialRampToValueAtTime(MIN_GAIN, start + attack + decay);
  return node;
}

/** Тон с быстрой атакой и затуханием. Возвращает длительность в секундах. */
export function tone(ctx: BaseAudioContext, destination: AudioNode, options: ToneOptions): number {
  const start = options.at ?? ctx.currentTime + (options.delay ?? 0);
  const attack = options.attack ?? 0.005;
  const length = attack + options.decay;
  const osc = ctx.createOscillator();
  osc.type = options.type ?? 'sine';
  osc.frequency.setValueAtTime(options.freq, start);
  if (options.freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(20, options.freqEnd),
      start + (options.glide ?? length),
    );
  }
  const env = envelope(ctx, start, attack, options.decay, options.gain);
  let tail: AudioNode = osc;
  if (options.lowpass !== undefined) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(options.lowpass, start);
    tail.connect(filter);
    tail = filter;
  }
  tail.connect(env);
  env.connect(destination);
  if (options.vibrato) {
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.setValueAtTime(options.vibrato.rate, start);
    depth.gain.setValueAtTime(options.freq * options.vibrato.depth, start);
    lfo.connect(depth);
    depth.connect(osc.frequency);
    lfo.start(start);
    lfo.stop(start + length + 0.05);
  }
  osc.start(start);
  osc.stop(start + length + 0.05);
  return (options.delay ?? 0) + length;
}

/** Белый шум на 1 с: создаётся один раз и переиспользуется всеми звуками. */
export function createNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** Короткий отфильтрованный шум: щелчок, шорох, «вжух». Возвращает длительность в секундах. */
export function noise(
  ctx: BaseAudioContext,
  destination: AudioNode,
  buffer: AudioBuffer,
  options: NoiseOptions,
): number {
  const start = ctx.currentTime + (options.delay ?? 0);
  const attack = options.attack ?? 0.002;
  const length = attack + options.decay;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = options.filter;
  filter.frequency.setValueAtTime(options.freq, start);
  if (options.freqEnd !== undefined) {
    filter.frequency.exponentialRampToValueAtTime(options.freqEnd, start + length);
  }
  filter.Q.setValueAtTime(options.q ?? 1, start);
  const env = envelope(ctx, start, attack, options.decay, options.gain);
  source.connect(filter);
  filter.connect(env);
  env.connect(destination);
  // Случайный отрезок буфера: одинаковые щелчки подряд не звучат «машинно».
  const offset = Math.random() * Math.max(0, buffer.duration - length - 0.05);
  source.start(start, offset, length + 0.05);
  return (options.delay ?? 0) + length;
}
