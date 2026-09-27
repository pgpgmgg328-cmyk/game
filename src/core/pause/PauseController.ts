/** Паузы, которые ставит окружение, а не игрок. */
export type SystemPauseReason =
  /** Вкладка скрыта или браузер свёрнут. */
  | 'hidden'
  /** Окно игры потеряло фокус. */
  | 'blur'
  /** Платформа прислала game_api_pause (реклама на старте, окно покупки и т. п.). */
  | 'sdk'
  /** Игра показывает полноэкранную рекламу или рекламу за награду. */
  | 'ad';

export interface PauseListener {
  /** Разметка геймплея: true — вызвать GameplayAPI.start(), false — GameplayAPI.stop(). */
  onGameplayChange?(active: boolean): void;
  /** Остановить (true) или продолжить (false) физику, таймеры и анимации забега. */
  onPausedChange?(paused: boolean): void;
  /** Выключить (true) или вернуть (false) весь звук. */
  onAudioMutedChange?(muted: boolean): void;
}

/**
 * Единое место, где решается, стоит ли игра на паузе.
 * Системные паузы снимаются сами, а пауза игрока — только им самим (CLAUDE.md: «возобновление,
 * только если игрок сам не ставил паузу»). События рассылаются только при изменении состояния.
 */
export class PauseController {
  private readonly reasons = new Set<SystemPauseReason>();
  private readonly listeners = new Set<PauseListener>();
  private userPaused = false;
  private runActive = false;
  private paused = false;
  private muted = false;
  private gameplay = false;

  /** Игра на паузе: по системной причине или по решению игрока. */
  get isPaused(): boolean {
    return this.paused;
  }

  get isUserPaused(): boolean {
    return this.userPaused;
  }

  /** Звук выключен: окружение забрало внимание игрока (вкладка, фокус, реклама, SDK). */
  get isAudioMuted(): boolean {
    return this.muted;
  }

  /** Идёт активный забег, и он не на паузе. Совпадает с последним вызовом GameplayAPI. */
  get isGameplayActive(): boolean {
    return this.gameplay;
  }

  hasSystemPause(reason: SystemPauseReason): boolean {
    return this.reasons.has(reason);
  }

  subscribe(listener: PauseListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setSystemPause(reason: SystemPauseReason, active: boolean): void {
    if (active) this.reasons.add(reason);
    else this.reasons.delete(reason);
    this.update();
  }

  setUserPaused(paused: boolean): void {
    this.userPaused = paused;
    this.update();
  }

  /** Забег начался (true) или закончился: выход в меню, экран результата (false). */
  setRunActive(active: boolean): void {
    this.runActive = active;
    // Пауза игрока относится к конкретному забегу: после выхода из него она не нужна.
    if (!active) this.userPaused = false;
    this.update();
  }

  private update(): void {
    const muted = this.reasons.size > 0;
    const paused = muted || this.userPaused;
    const gameplay = this.runActive && !paused;

    if (muted !== this.muted) {
      this.muted = muted;
      this.listeners.forEach((listener) => listener.onAudioMutedChange?.(muted));
    }
    if (paused !== this.paused) {
      this.paused = paused;
      this.listeners.forEach((listener) => listener.onPausedChange?.(paused));
    }
    if (gameplay !== this.gameplay) {
      this.gameplay = gameplay;
      this.listeners.forEach((listener) => listener.onGameplayChange?.(gameplay));
    }
  }
}
