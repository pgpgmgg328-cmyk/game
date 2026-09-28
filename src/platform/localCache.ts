/** Минимум от хранилища браузера, который нужен игре. В тестах подставляется своя реализация. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Ключ, под которым лежит локальная копия сохранения. */
export const SAVE_STORAGE_KEY = 'squishy-keys:save';

/**
 * Ключ снимка текущего забега. Снимок хранится только локально: запись каждые 5 с в облако
 * съела бы лимит запросов player.setData (docs/PROGRESS.md, «Принятые решения»).
 */
export const RUN_STORAGE_KEY = 'squishy-keys:run';

/**
 * localStorage, если он доступен. В приватном режиме или при запрете данных сайта браузер
 * бросает исключение уже при обращении к нему — тогда играем без локального кэша.
 */
export function browserStorage(): StorageLike | null {
  try {
    const storage = window.localStorage;
    const probe = 'squishy-keys:probe';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

/** Читает JSON. Отсутствие, битые данные и ошибки хранилища дают null. */
export function readJson(storage: StorageLike | null, key: string): unknown {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

/** Удаляет запись. Ошибки хранилища игнорируются. */
export function removeItem(storage: StorageLike | null, key: string): void {
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // Хранилище недоступно: удалять нечего.
  }
}

/** Пишет JSON. Возвращает false, если хранилище недоступно или переполнено. */
export function writeJson(storage: StorageLike | null, key: string, value: unknown): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
