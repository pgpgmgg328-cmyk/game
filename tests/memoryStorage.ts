import type { StorageLike } from '../src/platform/localCache';

/** Хранилище в памяти с возможностью сломать чтение или запись. */
export class MemoryStorage implements StorageLike {
  readonly items = new Map<string, string>();
  failReads = false;
  failWrites = false;

  getItem(key: string): string | null {
    if (this.failReads) throw new Error('SecurityError');
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error('QuotaExceededError');
    this.items.set(key, value);
  }
}
