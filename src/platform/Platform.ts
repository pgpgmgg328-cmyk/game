import type { SaveSources } from '../core/save/restore';
import type { SaveBackend } from '../core/save/SaveManager';

export type DeviceType = 'desktop' | 'mobile' | 'tablet' | 'tv';

/**
 * Всё, что игре нужно от площадки. Сцены знают только этот интерфейс,
 * SDK Яндекса вызывается только в YandexPlatform.
 *
 * В M0 здесь то, что нужно каркасу. Реклама, покупки, лидерборд, авторизация, флаги, отзыв,
 * ярлык и серверное время добавятся вместе с реализацией в M3.
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

  /** Сохранения из облака и из локального кэша (выбирает между ними core/save/restore). */
  loadSave(): Promise<SaveSources>;
}
