import type Phaser from 'phaser';
import { AudioEngine } from '../audio/AudioEngine';
import type { Layout } from '../core/layout';
import { PauseController } from '../core/pause/PauseController';
import type { SaveManager } from '../core/save/SaveManager';
import { createTranslator, type Lang, type Translate } from '../i18n';
import type { Platform } from '../platform';
import type { Viewport } from './viewport';

/** Ключ контекста в game.registry. */
export const CONTEXT_KEY = 'ctx';
/** Событие game.events: изменился размер экрана, аргумент — новый Layout. */
export const LAYOUT_EVENT = 'layout-changed';

/** Общие сервисы игры, доступные всем сценам. */
export class GameContext {
  readonly platform: Platform;
  readonly viewport: Viewport;
  readonly pause = new PauseController();
  /** Синтез звука и музыки (включается по первому жесту игрока). */
  readonly audio = new AudioEngine();
  /** Игрок попросил браузер убрать лишнюю анимацию (prefers-reduced-motion). */
  readonly reducedMotion: boolean;
  lang: Lang = 'ru';
  t: Translate = createTranslator('ru');
  private saveManager: SaveManager | null = null;

  constructor(platform: Platform, viewport: Viewport, reducedMotion: boolean) {
    this.platform = platform;
    this.viewport = viewport;
    this.reducedMotion = reducedMotion;
  }

  get layout(): Layout {
    return this.viewport.current;
  }

  /** Сохранения. Доступны после сцены Preload. */
  get save(): SaveManager {
    if (!this.saveManager) throw new Error('Сохранения ещё не загружены');
    return this.saveManager;
  }

  get saveLoaded(): boolean {
    return this.saveManager !== null;
  }

  setSave(manager: SaveManager): void {
    this.saveManager = manager;
  }

  setLang(lang: Lang): void {
    this.lang = lang;
    this.t = createTranslator(lang);
  }

  /** Немедленно отправить отложенные сохранения (пауза, скрытие вкладки). */
  flushSaves(): void {
    this.saveManager?.flush();
  }
}

export function getContext(game: Phaser.Game): GameContext {
  const ctx = game.registry.get(CONTEXT_KEY) as GameContext | undefined;
  if (!ctx) throw new Error('GameContext не установлен');
  return ctx;
}
