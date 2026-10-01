import { LocalPlatform } from './LocalPlatform';
import type { Platform } from './Platform';
import { YandexPlatform, type YaGamesGlobal } from './YandexPlatform';

export type {
  CatalogProduct,
  DeviceType,
  LeaderboardData,
  LeaderboardRow,
  OwnedPurchase,
  Platform,
  ReviewResult,
  RewardedResult,
} from './Platform';

/** Площадка Яндекса, если загружен /sdk.js, иначе локальная (`npm run dev`, тесты). */
export function createPlatform(): Platform {
  const yaGames = (window as Window & { YaGames?: YaGamesGlobal }).YaGames;
  return yaGames ? new YandexPlatform({ yaGames }) : new LocalPlatform();
}
