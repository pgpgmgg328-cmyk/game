import type { GameContext } from './context';

/**
 * Связывает события окружения с контроллером паузы (CLAUDE.md, «Звук и фокус»):
 * скрытие вкладки, потеря фокуса и пауза от SDK останавливают игру и звук, возврат — продолжает.
 * Разметка геймплея уходит на площадку при каждом изменении, сохранения отправляются сразу при скрытии.
 */
export function bindLifecycle(ctx: GameContext, gameElement: HTMLElement): void {
  const { pause, platform } = ctx;

  pause.subscribe({
    onGameplayChange: (active) => (active ? platform.gameplayStart() : platform.gameplayStop()),
    onAudioMutedChange: (muted) => ctx.audio.setSystemMuted(muted),
  });
  ctx.audio.bindUnlock(window);

  const syncVisibility = (): void => {
    const hidden = document.visibilityState === 'hidden';
    pause.setSystemPause('hidden', hidden);
    if (hidden) ctx.flushSaves();
  };
  document.addEventListener('visibilitychange', syncVisibility);
  window.addEventListener('pagehide', () => ctx.flushSaves());

  window.addEventListener('blur', () => pause.setSystemPause('blur', true));
  window.addEventListener('focus', () => pause.setSystemPause('blur', false));
  // Касание игры надёжно означает, что фокус у неё: на мобильных событие focus приходит не всегда.
  gameElement.addEventListener('pointerdown', () => pause.setSystemPause('blur', false), {
    capture: true,
  });

  platform.onPause(() => {
    pause.setSystemPause('sdk', true);
    ctx.flushSaves();
  });
  platform.onResume(() => pause.setSystemPause('sdk', false));

  syncVisibility();
}
