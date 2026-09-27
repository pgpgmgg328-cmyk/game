import { LocalPlatform } from './LocalPlatform';
import type { Platform } from './Platform';

export type { DeviceType, Platform } from './Platform';

/** Выбирает площадку для текущего запуска. */
export function createPlatform(): Platform {
  return new LocalPlatform();
}
