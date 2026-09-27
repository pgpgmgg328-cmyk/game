/** Минимум от хранилища браузера, который нужен игре. В тестах подставляется своя реализация. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Ключ, под которым лежит локальная копия сохранения. */
export const SAVE_STORAGE_KEY = 'squishy-keys:save';

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
