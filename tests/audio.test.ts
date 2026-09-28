import { describe, expect, it } from 'vitest';
import { mixState, VoiceLimiter } from '../src/audio/mix';
import { BASS, MELODY, MUSIC_STEP_SECONDS, midiToFrequency } from '../src/audio/music';

const base = { sound: true, music: true, systemMuted: false, unlocked: true };

describe('правила звука', () => {
  it('до первого жеста игрока AudioContext не запускается', () => {
    expect(mixState({ ...base, unlocked: false })).toMatchObject({
      running: false,
      musicPlaying: false,
    });
  });

  it('системная пауза (вкладка, фокус, SDK, реклама) выключает весь звук', () => {
    expect(mixState({ ...base, systemMuted: true })).toMatchObject({
      running: false,
      musicPlaying: false,
    });
    expect(mixState(base)).toEqual({ running: true, sfx: 1, music: 1, musicPlaying: true });
  });

  it('переключатели звука и музыки независимы', () => {
    expect(mixState({ ...base, music: false })).toEqual({
      running: true,
      sfx: 1,
      music: 0,
      musicPlaying: false,
    });
    expect(mixState({ ...base, sound: false })).toEqual({
      running: true,
      sfx: 0,
      music: 1,
      musicPlaying: true,
    });
    expect(mixState({ ...base, sound: false, music: false }).running).toBe(false);
  });
});

describe('ограничитель голосов', () => {
  it('не даёт звучать больше max голосов, фоновым — не больше половины', () => {
    const limiter = new VoiceLimiter(4);
    expect(limiter.tryStart(0, 1, false)).toBe(true);
    expect(limiter.tryStart(0, 1, false)).toBe(true);
    expect(limiter.tryStart(0, 1, false)).toBe(false);
    expect(limiter.tryStart(0, 1, true)).toBe(true);
    expect(limiter.tryStart(0, 1, true)).toBe(true);
    expect(limiter.tryStart(0, 1, true)).toBe(false);
    // Отзвучавшие голоса освобождают место.
    expect(limiter.tryStart(1.5, 1, true)).toBe(true);
    expect(limiter.active).toBe(1);
  });
});

describe('музыка', () => {
  it('частоты нот', () => {
    expect(midiToFrequency(69)).toBeCloseTo(440);
    expect(midiToFrequency(81)).toBeCloseTo(880);
    expect(midiToFrequency(60)).toBeCloseTo(261.63, 1);
  });

  it('мелодия в до-мажорной пентатонике, петля ровными тактами', () => {
    const pentatonic = new Set([0, 2, 4, 7, 9]);
    for (const note of [...MELODY, ...BASS]) {
      if (note === null) continue;
      expect(pentatonic.has(note % 12) || note % 12 === 5).toBe(true);
    }
    expect(MELODY.length % 16).toBe(0);
    expect(BASS.length * 4).toBe(MELODY.length);
    // Петля длиной меньше 15 с: короткий мотив.
    expect(MELODY.length * MUSIC_STEP_SECONDS).toBeLessThan(15);
  });
});
