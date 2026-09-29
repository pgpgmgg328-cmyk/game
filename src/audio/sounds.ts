import type { SoundData } from '../themes';
import { noise, tone } from './synth';

/** Куда играть: контекст, вход шины эффектов и общий буфер шума. */
export interface Voice {
  ctx: BaseAudioContext;
  out: AudioNode;
  noise: AudioBuffer;
}

/** Щелчок механической клавиши: короткий шум сверху и глухое «тук» снизу. */
function clack(voice: Voice, pitch: number, volume: number, delay = 0): number {
  const { ctx, out } = voice;
  const click = noise(ctx, out, voice.noise, {
    filter: 'highpass',
    freq: 2600,
    decay: 0.03,
    gain: 0.4 * volume,
    delay,
  });
  const thock = tone(ctx, out, {
    type: 'square',
    freq: pitch,
    freqEnd: pitch * 0.8,
    decay: 0.1,
    gain: 0.22 * volume,
    lowpass: 1400,
    delay,
  });
  // Вторая половина щелчка: клавиша «дошла до дна».
  const bottom = noise(ctx, out, voice.noise, {
    filter: 'bandpass',
    freq: 1800,
    q: 2,
    decay: 0.025,
    gain: 0.2 * volume,
    delay: delay + 0.035,
  });
  return Math.max(click, thock, bottom);
}

/** Звук появления формы по данным мира (диздок, таблица форм, колонка «Звук»). */
export function playForm(voice: Voice, sound: SoundData, pitchRatio: number): number {
  const { ctx, out } = voice;
  const pitch = sound.pitch * pitchRatio;
  const volume = sound.volume;
  let length = 0;
  switch (sound.kind) {
    case 'pik':
      length = tone(ctx, out, {
        freq: pitch,
        freqEnd: pitch * 1.18,
        glide: 0.03,
        decay: 0.09,
        gain: 0.4 * volume,
      });
      noise(ctx, out, voice.noise, { filter: 'highpass', freq: 4500, decay: 0.012, gain: 0.12 });
      break;
    case 'tuk':
      length = tone(ctx, out, {
        type: 'triangle',
        freq: pitch,
        freqEnd: pitch * 0.7,
        glide: 0.06,
        decay: 0.12,
        gain: 0.5 * volume,
      });
      noise(ctx, out, voice.noise, {
        filter: 'bandpass',
        freq: pitch * 2,
        q: 3,
        decay: 0.03,
        gain: 0.18 * volume,
      });
      break;
    case 'chpok':
      length = tone(ctx, out, {
        freq: pitch * 1.8,
        freqEnd: pitch * 0.55,
        glide: 0.07,
        decay: 0.11,
        gain: 0.55 * volume,
      });
      noise(ctx, out, voice.noise, {
        filter: 'lowpass',
        freq: 900,
        decay: 0.03,
        gain: 0.2 * volume,
      });
      break;
    case 'clack':
      length = clack(voice, pitch, volume);
      if (sound.echo) {
        clack(voice, pitch, volume * 0.35, sound.echo);
        length = clack(voice, pitch, volume * 0.12, sound.echo * 2) + 0.05;
      }
      break;
    case 'whoosh':
      noise(ctx, out, voice.noise, {
        filter: 'bandpass',
        freq: 400,
        freqEnd: 3200,
        q: 1.2,
        attack: 0.08,
        decay: 0.12,
        gain: 0.3 * volume,
      });
      length = clack(voice, pitch, volume, 0.18);
      break;
    case 'fanfare':
      length = fanfare(voice, pitch, volume);
      break;
  }
  // Маленький «поп» слияния поверх звука формы.
  tone(ctx, out, { freq: 700 * pitchRatio, freqEnd: 1300 * pitchRatio, decay: 0.05, gain: 0.08 });
  return length;
}

/** Аккорд с фанфарами: мажорное арпеджио и искорки сверху. */
export function fanfare(voice: Voice, root: number, volume: number): number {
  const { ctx, out } = voice;
  const steps = [1, 5 / 4, 3 / 2, 2];
  steps.forEach((ratio, index) =>
    tone(ctx, out, {
      type: 'triangle',
      freq: root * ratio,
      decay: 0.32,
      gain: 0.3 * volume,
      delay: index * 0.09,
    }),
  );
  let length = 0;
  steps.forEach((ratio) => {
    length = tone(ctx, out, {
      type: 'triangle',
      freq: root * ratio * 2,
      attack: 0.02,
      decay: 0.8,
      gain: 0.16 * volume,
      delay: 0.38,
    });
  });
  for (let i = 0; i < 5; i += 1) {
    tone(ctx, out, {
      freq: root * 8 * (1 + i * 0.12),
      decay: 0.08,
      gain: 0.06 * volume,
      delay: 0.4 + i * 0.07,
    });
  }
  return length;
}

/** Мега-клац: фанфары и мерцающий шорох. Без «взрыва»: игра 0+ (п. 3.4.2). */
export function playMega(voice: Voice): number {
  const { ctx, out } = voice;
  noise(ctx, out, voice.noise, {
    filter: 'highpass',
    freq: 5000,
    attack: 0.05,
    decay: 0.9,
    gain: 0.12,
  });
  return fanfare(voice, 262, 1);
}

/** Писк резинового мячика при тапе: маленькие клавиши пищат выше. */
export function playSquish(voice: Voice, tier: number): number {
  const pitch = 1250 / Math.sqrt(tier);
  return tone(voice.ctx, voice.out, {
    type: 'triangle',
    freq: pitch,
    freqEnd: pitch * 1.45,
    glide: 0.05,
    decay: 0.16,
    gain: 0.3,
    vibrato: { rate: 28, depth: 0.04 },
  });
}

/** Мягкий удар при приземлении, громкость по скорости. */
export function playLand(voice: Voice, speed: number, tier: number): number {
  const gain = Math.min(0.28, speed / 45);
  if (gain < 0.03) return 0;
  const pitch = 220 / Math.sqrt(tier);
  noise(voice.ctx, voice.out, voice.noise, {
    filter: 'lowpass',
    freq: 700,
    decay: 0.05,
    gain: gain * 0.6,
  });
  return tone(voice.ctx, voice.out, { freq: pitch * 1.4, freqEnd: pitch, decay: 0.08, gain });
}

/** Сброс клавиши: тихий «фьють». */
export function playDrop(voice: Voice): number {
  return tone(voice.ctx, voice.out, {
    freq: 520,
    freqEnd: 340,
    decay: 0.08,
    gain: 0.08,
  });
}

/** Кнопка интерфейса: короткий мягкий щелчок. */
export function playUi(voice: Voice): number {
  return clack(voice, 520, 0.5);
}

/** Конец забега: два мягких нисходящих звука, без грусти и укора. */
export function playGameOver(voice: Voice): number {
  tone(voice.ctx, voice.out, { type: 'triangle', freq: 523, decay: 0.28, gain: 0.25 });
  return tone(voice.ctx, voice.out, {
    type: 'triangle',
    freq: 392,
    decay: 0.45,
    gain: 0.25,
    delay: 0.22,
  });
}

/** Новый рекорд. */
export function playRecord(voice: Voice): number {
  return fanfare(voice, 392, 0.9);
}

/** «Тик» счётчика на экране результата. */
export function playTick(voice: Voice): number {
  return tone(voice.ctx, voice.out, { freq: 1600, decay: 0.025, gain: 0.05 });
}

/** Монетка долетела до счётчика: короткое звонкое «дзынь». */
export function playCoin(voice: Voice): number {
  tone(voice.ctx, voice.out, {
    type: 'square',
    freq: 1976,
    decay: 0.04,
    gain: 0.04,
    lowpass: 5000,
  });
  return tone(voice.ctx, voice.out, {
    type: 'square',
    freq: 2637,
    decay: 0.1,
    gain: 0.04,
    delay: 0.045,
    lowpass: 5000,
  });
}

/** «Встряска»: мягкий гул банки и дребезг клавиш. */
export function playShake(voice: Voice): number {
  noise(voice.ctx, voice.out, voice.noise, {
    filter: 'lowpass',
    freq: 380,
    attack: 0.03,
    decay: 0.35,
    gain: 0.3,
  });
  let length = 0;
  for (let i = 0; i < 5; i += 1) {
    length = clack(voice, 330 + i * 45, 0.28, 0.04 + i * 0.065);
  }
  return length;
}

/** «Удаление»: клавиша исчезает с мягким «пуф». */
export function playPoof(voice: Voice): number {
  noise(voice.ctx, voice.out, voice.noise, {
    filter: 'bandpass',
    freq: 1400,
    freqEnd: 300,
    q: 0.8,
    attack: 0.01,
    decay: 0.24,
    gain: 0.32,
  });
  return tone(voice.ctx, voice.out, { freq: 620, freqEnd: 200, decay: 0.2, gain: 0.14 });
}

/** «НОВАЯ ФОРМА!»: восходящее арпеджио с искорками. */
export function playNewForm(voice: Voice): number {
  const notes = [523, 659, 784, 1047];
  let length = 0;
  notes.forEach((freq, index) => {
    length = tone(voice.ctx, voice.out, {
      type: 'triangle',
      freq,
      decay: 0.22,
      gain: 0.22,
      delay: index * 0.075,
    });
  });
  for (let i = 0; i < 3; i += 1) {
    tone(voice.ctx, voice.out, {
      freq: 3136 + i * 400,
      decay: 0.06,
      gain: 0.04,
      delay: 0.3 + i * 0.05,
    });
  }
  return length;
}

/** «ЛЕГЕНДАРНАЯ ФОРМА!»: большие фанфары и мерцание. */
export function playLegendary(voice: Voice): number {
  noise(voice.ctx, voice.out, voice.noise, {
    filter: 'highpass',
    freq: 5000,
    attack: 0.2,
    decay: 1.4,
    gain: 0.1,
  });
  fanfare(voice, 196, 1);
  return tone(voice.ctx, voice.out, {
    type: 'triangle',
    freq: 784,
    attack: 0.05,
    decay: 1.2,
    gain: 0.14,
    delay: 0.75,
    vibrato: { rate: 6, depth: 0.01 },
  });
}

/** Достижение: колокольчик из двух нот. */
export function playAchievement(voice: Voice): number {
  tone(voice.ctx, voice.out, { type: 'triangle', freq: 880, decay: 0.35, gain: 0.2 });
  return tone(voice.ctx, voice.out, {
    type: 'triangle',
    freq: 1319,
    decay: 0.5,
    gain: 0.2,
    delay: 0.12,
  });
}

/** Нота «пианино» для клавиш логотипа: мягкий треугольник с колокольчиком сверху. */
export function playNote(voice: Voice, freq: number): number {
  tone(voice.ctx, voice.out, { freq: freq * 2, decay: 0.18, gain: 0.05 });
  return tone(voice.ctx, voice.out, { type: 'triangle', freq, decay: 0.45, gain: 0.22 });
}

/** Дождь из клавиш: каскад тихих щелчков сверху вниз. */
export function playRain(voice: Voice): number {
  let length = 0;
  for (let i = 0; i < 8; i += 1) {
    length = tone(voice.ctx, voice.out, {
      freq: 2093 - i * 160,
      decay: 0.06,
      gain: 0.07,
      delay: i * 0.06,
    });
  }
  return length;
}
