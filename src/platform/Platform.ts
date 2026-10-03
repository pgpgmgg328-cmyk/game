import type { RunSnapshot } from '../core/run/snapshot';
import type { SaveSources } from '../core/save/restore';
import type { SaveBackend } from '../core/save/SaveManager';

export type DeviceType = 'desktop' | 'mobile' | 'tablet' | 'tv';

/** Чем закончилась реклама за награду. */
export type RewardedResult =
  /** Досмотрена: награда уже выдана в onRewarded. */
  | 'rewarded'
  /** Закрыта раньше, чем засчитался просмотр: награды нет. */
  | 'closed'
  /** Реклама не открылась или сломалась: «Реклама пока недоступна». */
  | 'error';

/** Товар из каталога площадки: цена и портальная валюта берутся только из SDK (п. 1.13.2). */
export interface CatalogProduct {
  id: string;
  /** Цена числом, как в каталоге: «99». */
  priceValue: string;
  /** Код портальной валюты, например «YAN». */
  currencyCode: string;
  /** Адрес иконки портальной валюты из SDK; пустая строка — иконки нет. */
  currencyImage: string;
}

/** Покупка игрока: какой товар и токен для консумирования. */
export interface OwnedPurchase {
  productId: string;
  token: string;
}

/** Строка таблицы рекордов. Имён других игроков игра не показывает (безопасность детей). */
export interface LeaderboardRow {
  rank: number;
  score: number;
  /** Это сам игрок. */
  self: boolean;
  /** Постоянное число для картинки рядом со счётом (из id игрока), чтобы строки различались. */
  seed: number;
}

export interface LeaderboardData {
  /** Топ таблицы по порядку мест. */
  top: LeaderboardRow[];
  /** Строка игрока, если он вошёл и есть в таблице. */
  player: LeaderboardRow | null;
}

/** Чем кончилась просьба оценить игру. */
export type ReviewResult =
  /** Окно оценки показано. */
  | 'shown'
  /** Игрок уже оценил игру или его уже просили: больше не спрашиваем. */
  | 'done'
  /** Сейчас нельзя (нет входа, нет SDK, ошибка): можно попробовать в другой раз. */
  | 'later';

/**
 * Всё, что игре нужно от площадки. Сцены знают только этот интерфейс,
 * SDK Яндекса вызывается только в YandexPlatform.
 */
export interface Platform extends SaveBackend {
  readonly kind: 'yandex' | 'local';
  /** Язык интерфейса площадки (ISO 639-1). Известен после init(). */
  readonly lang: string;
  /** Тип устройства. Известен после init(). */
  readonly deviceType: DeviceType;

  /** Подключение к площадке. Не бросает исключений: при сбое игра работает без её функций. */
  init(): Promise<void>;

  /** Игра загрузилась и принимает ввод (LoadingAPI.ready). Повторные вызовы игнорируются. */
  ready(): void;

  /** Разметка геймплея: GameplayAPI.start() и GameplayAPI.stop(). */
  gameplayStart(): void;
  gameplayStop(): void;

  /** Площадка просит поставить игру на паузу или продолжить (game_api_pause / game_api_resume). */
  onPause(listener: () => void): () => void;
  onResume(listener: () => void): () => void;

  /**
   * Сохранения из облака и из локального кэша (выбирает между ними core/save/restore).
   * Заново запрашивает игрока: так же перечитывается прогресс после входа и выбора аккаунта.
   */
  loadSave(): Promise<SaveSources>;

  /**
   * Дождаться, пока последнее сохранение дойдёт до облака. false — не дошло: облака нет,
   * ошибка сети или не успели за timeoutMs. Так покупка консумируется только после записи.
   */
  syncSave(timeoutMs: number): Promise<boolean>;

  /** Снимок текущего забега из локального кэша, как есть (проверяет core/run/snapshot). */
  loadRunSnapshot(): unknown;

  /** Записать снимок текущего забега или удалить его (null). */
  saveRunSnapshot(snapshot: RunSnapshot | null): void;

  // ── Реклама ───────────────────────────────────────────────────────────────────────────

  /** Полноэкранная реклама. Выполняется, когда реклама закрыта или не открылась; true — показана. */
  showInterstitial(): Promise<boolean>;

  /** Реклама за награду. onRewarded вызывается из колбэка onRewarded SDK: только там игра выдаёт награду. */
  showRewarded(onRewarded: () => void): Promise<RewardedResult>;

  /** Показать или скрыть стики-баннер (через API SDK; после покупки «Без рекламы» он скрыт). */
  setBannerVisible(visible: boolean): void;

  // ── Покупки ───────────────────────────────────────────────────────────────────────────

  /** Каталог покупок или null, если покупки сейчас недоступны. */
  getCatalog(): Promise<CatalogProduct[] | null>;

  /** Покупки игрока: постоянные и ещё не консумированные. null — список получить не удалось. */
  getPurchases(): Promise<OwnedPurchase[] | null>;

  /** Купить товар. null — игрок закрыл окно оплаты или покупка не прошла. */
  purchase(productId: string): Promise<OwnedPurchase | null>;

  /** Консумировать покупку (после выдачи и записи в облако). true — получилось. */
  consumePurchase(token: string): Promise<boolean>;

  // ── Игрок ─────────────────────────────────────────────────────────────────────────────

  /** Игрок вошёл в Яндекс ID. */
  readonly authorized: boolean;

  /** Вход возможен: площадка его поддерживает, а игрок ещё не вошёл. */
  readonly canAuthorize: boolean;

  /** Окно входа в Яндекс ID. true — игрок вошёл; затем прогресс нужно перечитать (loadSave). */
  openAuthDialog(): Promise<boolean>;

  /**
   * Окно выбора аккаунта открыто (true) или закрыто (false). Пока окно открыто, облачные
   * записи стоят; после закрытия прогресс нужно перечитать и выйти в меню.
   */
  onAccountSelection(listener: (open: boolean) => void): () => void;

  // ── Лидерборд ─────────────────────────────────────────────────────────────────────────

  /** Отправить лучший счёт в таблицу рекордов. Только у вошедшего игрока; true — отправлен. */
  submitScore(score: number): Promise<boolean>;

  /** Топ таблицы и строка игрока или null, если таблица недоступна. */
  getLeaderboard(): Promise<LeaderboardData | null>;

  // ── Прочее ────────────────────────────────────────────────────────────────────────────

  /** Флаги remote config. Значения по умолчанию — из config/balance.ts; при сбое — они же. */
  getFlags(defaults: Readonly<Record<string, string>>): Promise<Record<string, string>>;

  /** Попросить оценить игру, если площадка разрешает. */
  requestReview(): Promise<ReviewResult>;

  /** Можно ли сейчас предложить ярлык на рабочий стол. */
  canAddShortcut(): Promise<boolean>;

  /** Предложить ярлык на рабочий стол. true — игрок согласился. */
  addShortcut(): Promise<boolean>;

  /**
   * Время в мс, которое не подкрутить часами устройства (ysdk.serverTime()): по нему считаются
   * дни для «Клавиши дня» и подарка. Без площадки — время устройства.
   */
  serverTime(): number;
}
