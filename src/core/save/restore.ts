import { readSave, type ReadResult } from './migrate';
import { createDefaultSave, type Save } from './schema';

export interface SaveSources {
  /** Данные из облака (player.getData) или null, если облака нет. */
  cloud: unknown;
  /** Данные из локального кэша или null. */
  local: unknown;
}

export interface RestoredSave {
  save: Save;
  /**
   * false, если в одном из источников лежит сохранение более новой версии игры.
   * Тогда играем, но ничего не записываем, чтобы не затереть чужой прогресс.
   */
  writable: boolean;
  source: 'cloud' | 'local' | 'default';
}

/** Выбирает, с каким сохранением стартовать: более свежее по rev, при равенстве — облачное. */
export function restoreSave(
  sources: SaveSources,
  read: (raw: unknown) => ReadResult = readSave,
): RestoredSave {
  const cloud = read(sources.cloud);
  const local = read(sources.local);
  const writable = cloud.kind !== 'future' && local.kind !== 'future';

  if (cloud.kind === 'ok' && local.kind === 'ok') {
    return local.save.rev > cloud.save.rev
      ? { save: local.save, writable, source: 'local' }
      : { save: cloud.save, writable, source: 'cloud' };
  }
  if (cloud.kind === 'ok') return { save: cloud.save, writable, source: 'cloud' };
  if (local.kind === 'ok') return { save: local.save, writable, source: 'local' };
  return { save: createDefaultSave(), writable, source: 'default' };
}

/**
 * Прогресс после входа в Яндекс ID или выбора аккаунта (docs/yandex/sdk/sdk-events.md): облако
 * аккаунта важнее локального кэша — этот прогресс выбрал игрок или перенесла платформа.
 * Если в облаке пусто или данные битые, остаётся текущий прогресс: его надо сразу записать
 * в облако аккаунта. Сохранение от более новой версии игры читается как есть и не затирается.
 */
export function restoreAfterSignIn(
  cloudRaw: unknown,
  current: Save,
  read: (raw: unknown) => ReadResult = readSave,
): RestoredSave {
  const cloud = read(cloudRaw);
  if (cloud.kind === 'ok') return { save: cloud.save, writable: true, source: 'cloud' };
  return { save: current, writable: cloud.kind !== 'future', source: 'local' };
}
