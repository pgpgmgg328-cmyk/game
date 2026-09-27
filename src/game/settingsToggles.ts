import type { Settings } from '../core/save/schema';
import type { GameContext } from './context';

export type ToggleSetting = keyof Settings;

const LABEL_KEYS = { sound: 'settings.sound', music: 'settings.music' } as const;

/** Надпись переключателя, например «Звук: вкл». */
export function toggleLabel(ctx: GameContext, setting: ToggleSetting): string {
  const state = ctx.t(ctx.save.data.settings[setting] ? 'common.on' : 'common.off');
  return ctx.t(LABEL_KEYS[setting], { state });
}

/** Переключает настройку и сразу сохраняет её (смена настроек — значимое действие по ТЗ). */
export function toggleSetting(ctx: GameContext, setting: ToggleSetting): void {
  ctx.save.update((draft) => {
    draft.settings[setting] = !draft.settings[setting];
  });
}
