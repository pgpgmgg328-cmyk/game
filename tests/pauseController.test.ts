import { describe, expect, it } from 'vitest';
import { PauseController } from '../src/core/pause/PauseController';

function setup() {
  const controller = new PauseController();
  const events: string[] = [];
  controller.subscribe({
    onGameplayChange: (active) => events.push(active ? 'gameplay:start' : 'gameplay:stop'),
    onPausedChange: (paused) => events.push(paused ? 'pause' : 'resume'),
    onAudioMutedChange: (muted) => events.push(muted ? 'mute' : 'unmute'),
  });
  return { controller, events };
}

describe('PauseController', () => {
  it('в начале нет паузы, звук не выключен, геймплей не начат', () => {
    const { controller, events } = setup();
    expect(controller.isPaused).toBe(false);
    expect(controller.isAudioMuted).toBe(false);
    expect(controller.isGameplayActive).toBe(false);
    expect(events).toEqual([]);
  });

  it('начало забега размечает старт геймплея один раз', () => {
    const { controller, events } = setup();
    controller.setRunActive(true);
    controller.setRunActive(true);
    expect(events).toEqual(['gameplay:start']);
    expect(controller.isGameplayActive).toBe(true);
  });

  it('потеря фокуса выключает звук и останавливает забег, возврат — возобновляет', () => {
    const { controller, events } = setup();
    controller.setRunActive(true);
    controller.setSystemPause('blur', true);
    controller.setSystemPause('blur', false);
    expect(events).toEqual([
      'gameplay:start',
      'mute',
      'pause',
      'gameplay:stop',
      'unmute',
      'resume',
      'gameplay:start',
    ]);
  });

  it('держит паузу, пока не сняты все системные причины', () => {
    const { controller, events } = setup();
    controller.setRunActive(true);
    controller.setSystemPause('hidden', true);
    controller.setSystemPause('blur', true);
    controller.setSystemPause('hidden', false);
    expect(controller.isPaused).toBe(true);
    expect(controller.hasSystemPause('blur')).toBe(true);
    controller.setSystemPause('blur', false);
    expect(controller.isPaused).toBe(false);
    expect(events.filter((e) => e.startsWith('gameplay'))).toEqual([
      'gameplay:start',
      'gameplay:stop',
      'gameplay:start',
    ]);
  });

  it('после системной паузы не возобновляет забег, если игрок сам поставил паузу', () => {
    const { controller, events } = setup();
    controller.setRunActive(true);
    controller.setUserPaused(true);
    controller.setSystemPause('sdk', true);
    controller.setSystemPause('sdk', false);
    expect(controller.isPaused).toBe(true);
    expect(controller.isAudioMuted).toBe(false);
    expect(events).toEqual(['gameplay:start', 'pause', 'gameplay:stop', 'mute', 'unmute']);
    controller.setUserPaused(false);
    expect(events.slice(-2)).toEqual(['resume', 'gameplay:start']);
  });

  it('пауза игрока не выключает звук', () => {
    const { controller } = setup();
    controller.setRunActive(true);
    controller.setUserPaused(true);
    expect(controller.isPaused).toBe(true);
    expect(controller.isAudioMuted).toBe(false);
  });

  it('в меню системная пауза выключает звук, но геймплей не размечает', () => {
    const { controller, events } = setup();
    controller.setSystemPause('sdk', true);
    expect(events).toEqual(['mute', 'pause']);
    controller.setRunActive(true);
    expect(controller.isGameplayActive).toBe(false);
    controller.setSystemPause('sdk', false);
    expect(events).toEqual(['mute', 'pause', 'unmute', 'resume', 'gameplay:start']);
  });

  it('реклама останавливает геймплей синхронно, до вызова SDK', () => {
    const { controller, events } = setup();
    controller.setRunActive(true);
    events.length = 0;
    controller.setSystemPause('ad', true);
    expect(events).toContain('gameplay:stop');
    expect(controller.isGameplayActive).toBe(false);
  });

  it('выход из забега снимает паузу игрока и не дублирует stop', () => {
    const { controller, events } = setup();
    controller.setRunActive(true);
    controller.setUserPaused(true);
    controller.setRunActive(false);
    expect(controller.isUserPaused).toBe(false);
    expect(controller.isPaused).toBe(false);
    expect(events).toEqual(['gameplay:start', 'pause', 'gameplay:stop', 'resume']);
  });

  it('повторная установка той же причины ничего не рассылает', () => {
    const { controller, events } = setup();
    controller.setSystemPause('hidden', true);
    controller.setSystemPause('hidden', true);
    controller.setSystemPause('blur', false);
    expect(events).toEqual(['mute', 'pause']);
  });

  it('отписка прекращает уведомления', () => {
    const controller = new PauseController();
    const events: boolean[] = [];
    const unsubscribe = controller.subscribe({ onPausedChange: (paused) => events.push(paused) });
    controller.setSystemPause('blur', true);
    unsubscribe();
    controller.setSystemPause('blur', false);
    expect(events).toEqual([true]);
  });
});
