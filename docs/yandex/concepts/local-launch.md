<!-- Источник: https://yandex.ru/dev/games/doc/ru/concepts/local-launch (текст из https://yandex.ru/dev/games/doc/ru/llms-full.txt), скачано 2026-09-26 -->

# Запуск с локального сервера







Чтобы упростить разработку и тестирование игры, вы можете запустить ее с локального сервера. Тестирование доступно в [prod-](https://yandex.ru/dev/games/doc/ru/#prod-env) и [dev-окружениях](https://yandex.ru/dev/games/doc/ru/#dev-env).

После запуска игры на локальном сервере вы можете использовать из нее все функции SDK.



## Prod-окружение {#prod-env}

{% note alert %}

Требуются [регистрация](https://yandex.ru/dev/games/doc/console/manage-account) на платформе Яндекс Игры и [черновик игры](https://yandex.ru/dev/games/doc/console/add-new-game#create-draft).

{% endnote %}

Подходит на этапе финальной проверки игры перед отправкой на модерацию. В этом режиме игра взаимодействует с реальной платформой Яндекс Игры.

Особенности:

- Игра открывается по реальному адресу на [yandex.ru/games](https://yandex.ru/games){.external}.
- Чтобы отправлять запросы на внешние хосты, их нужно [добавить](https://yandex.ru/dev/games/doc/console/add-new-game.md#check-host) в правила для CSP.
- Показывается настоящая реклама.
- Игрок авторизуется через Яндекс Паспорт.
- Данные игрока и лидербордов сохраняются на сервере.
- Каталог товаров загружается с сервера, покупки обрабатываются на сервере.
- Для отладки можно использовать [debug-панель](https://yandex.ru/dev/games/doc/console/debug-panel.md) через параметр адресной строки `&debug-mode=16`.

Запуск локальной версии игры в prod-окружении можно настроить:

- [самостоятельно](https://yandex.ru/dev/games/doc/ru/#self-setup)
- [с помощью npm-пакета](https://yandex.ru/dev/games/doc/ru/#setup-localhost)

### Самостоятельная настройка локального сервера {#self-setup}

1. Настройте сервер `localhost`.
1. Откройте игру в [режиме черновика](https://yandex.ru/dev/games/doc/console/test-game).
1. Добавьте в адрес параметр `?game_url=https://localhost`.

{% note info %}

Из соображений безопасности в параметре `game_url` поддерживается только домен `localhost`.

{% endnote %}

### Настройка локального сервера с помощью npm-пакета {#setup-localhost}

1. Установите `npm`, следуя инструкциям на сайте [Node.JS](https://nodejs.org/en/){.external}.
1. С помощью `npm` установите пакет [@yandex-games/sdk-dev-proxy](https://www.npmjs.com/package/@yandex-games/sdk-dev-proxy){.external}:

    ```console
    npm install -g @yandex-games/sdk-dev-proxy
    ```

1. Запустите игру. Вы можете:

   {% list tabs %}

   - Проксировать до локального сервера

      ```console
      npx @yandex-games/sdk-dev-proxy -h <Адрес локального сервера>
      ```

   - Указать папку с ресурсами игры

       ```console
       npx @yandex-games/sdk-dev-proxy -p <Путь до папки с игрой>
       ```

   {% endlist %}

    Пакет проксирует запросы до ресурсов SDK на том же сервере, на котором будет расположена ваша игра.


Если вы укажете параметр `--app-id`, то при запуске откроется ваша игра на [yandex.ru/games](https://yandex.ru/games){.external}:


```console
npx @yandex-games/sdk-dev-proxy -p <Путь до папки с игрой> --app-id=<ID игры>
```

Если не указать `--app-id`, то в консоли появятся шаблонная ссылка на игру на сервисе и ссылка на локальный сервер.

#### Параметры для запуска {#start-params}

#|
|| **Параметр** | **Описание** ||
|| `--help` | Справка. ||
|| `--host`, `-h` | Хост, на котором расположен локальный сервер игры (например, используется для `webpack-dev-server`). ||
|| `--path`, `-p` | Путь до папки, в которой расположены ресурсы игры. ||
|| `--port` | Порт, на котором откроется сервер (по умолчанию 8080). ||
|| `--app-id`, `-i` | ID черновика игры. ||
|| `--csp`, `-c` | Добавляет метатег с `Content-Security-Policy`. Он соответствует тегу, который будет создан в `index.html` на сервисе. ||
|| `--log`, `-l` | Включение логирования запросов в консоль (по умолчанию включено). ||
|| `--tld` | Меняет [домен](https://yandex.ru/dev/games/doc/ru/languages-and-domains.md) `yandex.tld`, например, на `yandex.com` (по умолчанию `ru`). ||
|| `--dev-mode` | Если `true`, то запускает игру в dev-окружении (по умолчанию `false`, что соответствует prod-окружению). ||
|#



## Dev-окружение {#dev-env}

{% note info %}

Регистрация на платформе Яндекс Игры и черновик игры не требуются.

{% endnote %}

Подходит на этапе активной разработки и отладки игровой логики. В этом режиме у игры нет реальной связи с платформой Яндекс Игры, а все вызовы SDK подменены [моками](https://yandex.ru/dev/games/doc/ru/*mock), что дает возможность быстро перезагружать страницу и видеть обновления.

Особенности:

- Игра открывается напрямую в `https://localhost`.
- Нет ограничений по CSP, можно отправлять запросы на любые внешние хосты.
- Вместо рекламы показываются заглушки, при этом все callback-функции отрабатывают аналогично prod-окружению.
- Авторизация игрока работает через мок браузерного диалога.
- Данные игрока и лидербордов сохраняются в `localStorage`.
- Каталог товаров загружается из [локального файла](https://yandex.ru/dev/games/doc/ru/#local-catalog-set), покупки игрока сохраняются в `localStorage`.
- Для отладки можно задавать [параметры](https://yandex.ru/dev/games/doc/ru/#available-params) через адресную строку браузера.
- В консоли браузера автоматически логируются все вызовы SDK с разбивкой по модулям.

Запуск в dev-окружении также доступен через npm-пакет [@yandex-games/sdk-dev-proxy](https://www.npmjs.com/package/@yandex-games/sdk-dev-proxy){.external}. Инструкции по настройке аналогичны [prod-окружению](https://yandex.ru/dev/games/doc/ru/#setup-localhost), только при запуске нужно указать параметр `--dev-mode=true`.

Вы можете:

{% list tabs %}

   - Проксировать до локального сервера

      ```console
      npx @yandex-games/sdk-dev-proxy -h <Адрес локального сервера> --dev-mode=true
      ```

   - Указать папку с ресурсами игры

       ```console
       npx @yandex-games/sdk-dev-proxy -p <Путь до папки с игрой> --dev-mode=true
       ```

{% endlist %}

#### Доступные параметры для адресной строки браузера {#available-params}

```ts showLineNumbers
export interface SDKMocks {
    /** Разрешено ли добавить ярлык на рабочий стол? */
    canShowPrompt?: boolean;
    /** Авторизован ли игрок? */
    isAuthorized?: boolean;
    /** Если у игры заблокирована ориентация. */
    lockedOrientation?: ELockedOrientation;
}

/** Заблокированная ориентация игры на мобильном экране. */
export enum ELockedOrientation {
    /** Игра поддержана только в landscape. */
    LANDSCAPE = 'landscape',
    /** Игра поддержана в обеих ориентациях. */
    NONE = 'none',
    /** Игра поддержана только в portrait. */
    PORTRAIT = 'portrait',
}
```

**Пример**

```text
localhost:8080?mocks={"canShowPrompt":true,"isAuthorized":true,"lockedOrientation":"landscape"}
```

#### Локальное задание каталога товаров {#local-catalog-set}

Для эмуляции каталога товаров создайте в корне проекта файл `purchases-catalog.json` и добавьте в него список покупок — такой же, как вы уже внесли или планируете внести в [Консоли разработчика](https://games.yandex.ru/console){.external}. SDK в dev-режиме будет загружать список покупок из этого файла.

**Пример**

```json showLineNumbers
[
    {
        "description": "Well styled modern avatar image",
        "id": "avatar",
        "imageURI": "{path-to-image}",
        "price": "100 RUB",
        "priceCurrencyCode": "RUB",
        "priceValue": "100",
        "title": "Premium avatar",
        "getPriceCurrencyImage": "return ''"
    }
]
```

В момент вызова покупки будет показан мок диалога с опциями успешной покупки и отмены, чтобы вы могли проверить оба сценария.

[*landscape]: Альбомная ориентация.

[*portrait]: Портретная ориентация.

[*mock]: Искусственные объекты или функции, имитирующие реальные. Используются для тестирования кода без зависимости от внешних ресурсов или компонентов.

[*return]: В `''` можно подставить путь до изображения.
