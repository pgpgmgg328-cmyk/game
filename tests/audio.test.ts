import { describe, expect, it } from 'vitest';
import { mixState, VoiceLimiter } from '../src/audio/mix';
import { midiToFrequency, stepSeconds } from '../src/audio/music';
import { THEMES } from '../src/themes';

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

  it('у каждого мира свой короткий мотив ровными тактами', () => {
    const songs = new Set(THEMES.map((theme) => theme.music));
    expect(songs.size).toBe(THEMES.length);
    for (const theme of THEMES) {
      const { melody, bass, bpm, decay } = theme.music;
      expect(melody.length % 16, theme.id).toBe(0);
      expect(bass.length * 4, theme.id).toBe(melody.length);
      // Петля короче 15 с: короткий лёгкий мотив (диздок, раздел 13).
      expect(melody.length * stepSeconds(theme.music), theme.id).toBeLessThan(15);
      expect(bpm).toBeGreaterThanOrEqual(60);
      expect(decay).toBeGreaterThan(0);
      for (const note of [...melody, ...bass]) {
        if (note === null) continue;
        // Ноты в удобном диапазоне: от низкого баса до высокой мелодии.
        expect(note).toBeGreaterThanOrEqual(33);
        expect(note).toBeLessThanOrEqual(96);
      }
      expect(melody.filter((note) => note === null).length).toBeGreaterThan(0);
    }
  });

  it('мир 1 — в до-мажорной пентатонике', () => {
    const pentatonic = new Set([0, 2, 4, 7, 9]);
    const { melody, bass } = THEMES[0]!.music;
    for (const note of [...melody, ...bass]) {
      if (note === null) continue;
      expect(pentatonic.has(note % 12) || note % 12 === 5).toBe(true);
    }
  });
});
