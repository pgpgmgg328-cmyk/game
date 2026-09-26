<!-- Источник: https://yandex.ru/dev/games/doc/ru/sdk/sdk-about (текст из https://yandex.ru/dev/games/doc/ru/llms-full.txt), скачано 2026-09-26 -->

# Подключение и использование







## Подключение {#connect}

{% note alert %}

Чтобы ваша игра успешно прошла модерацию, укажите актуальный путь для подключения SDK Яндекс&nbsp;Игр:

- Если вы загружаете архив игры на сервер Яндекса через [Консоль разработчика](https://games.yandex.ru/console){.external}, укажите [относительный путь](https://yandex.ru/dev/games/doc/ru/#yandex-server). Это рекомендуемый вариант.
- Если вы используете интеграцию через свой домен, укажите [абсолютный путь](https://yandex.ru/dev/games/doc/ru/#iframe).

{% endnote %}

Подключить SDK Яндекс&nbsp;Игр можно двумя равноправными способами:

- Через тег `<script>`.
- Динамической загрузкой — она позволяет программно контролировать процесс подключения и обрабатывать события загрузки.

### Сервер Яндекса {#yandex-server}

{% note info %}

Для проксирования `/sdk.js` при разработке используйте [локальный сервер](https://yandex.ru/dev/games/doc/concepts/local-launch.md). Скачивать файл `sdk.js` не нужно.

{% endnote %}

{% list tabs %}

- Тег <script>

    Добавьте в заголовок `<head>` HTML-страницы строку:

    ```html showLineNumbers
    <!-- Yandex Games SDK -->
    <script src="/sdk.js"></script>
    ```

    Используйте атрибуты:
    - `async` — для неблокирующей загрузки.
    - `onload` — для выполнения кода после загрузки скрипта.

    Пример кода для запуска `initSDK` после загрузки скрипта. `initSDK` подразумевает [инициализацию SDK](https://yandex.ru/dev/games/doc/ru/#use):

    ```html showLineNumbers
    <!-- Yandex Games SDK -->
    <script async src="/sdk.js" onload="initSDK()"></script>
    ```

- Динамическая загрузка

    Добавьте в свой тег `<script>` или JSON-файл фрагмент кода:

    ```javascript showLineNumbers
    const script = document.createElement('script');
    script.src = '/sdk.js';
    script.async = true;
    script.onload = initSDK;
    document.body.append(script);
    ```

    В этом примере `initSDK` подразумевает [инициализацию SDK](https://yandex.ru/dev/games/doc/ru/#use) после загрузки скрипта.

{% endlist %}

### Свой домен {#iframe}

При размещении игры на собственном домене используйте абсолютный путь `https://sdk.games.s3.yandex.net/sdk.js` вместо относительного `/sdk.js`:

```html showLineNumbers
<!-- Yandex Games SDK -->
<script src="https://sdk.games.s3.yandex.net/sdk.js"></script>
```

## Использование {#use}

После загрузки скрипта инициализируйте SDK, используя метод `init()` объекта `YaGames`.

{% note tip %}

В `YaGames.init()` и [ysdk.getPayments()](https://yandex.ru/dev/games/doc/ru/sdk-purchases.md#install) можно передать опциональный параметр `signed: boolean`, который предназначен для [защиты от накруток](https://yandex.ru/dev/games/doc/ru/sdk-purchases.md#signature). Выбор значения зависит от того, где обрабатываются платежи:

- Если на стороне клиента — вызовите методы без параметра `signed: boolean` или передайте `signed: false`. Методы покупок будут возвращать данные в открытом виде.
- Если на стороне сервера — передайте `signed: true`. В таком случае в ответах методов [payments.getPurchases()](https://yandex.ru/dev/games/doc/ru/sdk-purchases.md#getpurchases) и [payments.purchase()](https://yandex.ru/dev/games/doc/ru/sdk-purchases.md#payments-purchase) все данные возвращаются только в зашифрованном виде в параметре `signature`.

{% endnote %}

{% list tabs %}

- Обработка на стороне клиента

    Инициализация с параметром по умолчанию (`signed: false`):

    ```javascript
    const ysdk = await YaGames.init();
    ```

- Обработка на сервере

    Инициализация с параметром `signed: true`:

    ```javascript
    const ysdk = await YaGames.init({ signed: true });
    ```

{% endlist %}

&nbsp; {.empty}

## Проверка {#check}

{% note warning %}

Скрипт `/sdk.js` должен быть подключен до выполнения [YaGames.init()](https://yandex.ru/dev/games/doc/ru/#use).

{% endnote %}

Проверьте правильность подключения SDK с помощью лоадера:

1. Запустите игру с [debug-панелью](https://yandex.ru/dev/games/doc/console/debug-panel.md):

    {% list tabs %}

    - Через Консоль разработчика
        1. Откройте [Консоль Яндекс Игр](https://games.yandex.ru/console){.external}.
        1. Выберите нужную игру.
        1. В левом верхнем углу нажмите **Открыть с debug-панелью**.

    - Через адресную строку
        1. Откройте нужную игру.
        1. Добавьте параметр `debug-mode=16` в конец адресной строки браузера.

           Пример ссылки: `https://yandex.ru/games/app/XXXX?debug-mode=16`, где `XXXX` — уникальный идентификатор игры.

    {% endlist %}

2. В левом нижнем углу проверьте значение индикатора [лоадера](https://yandex.ru/dev/games/doc/console/debug-panel.md#loader):
    - `W` — ожидает инициализации.
    - `IT` — загрузчик SDK инициализирован верно.
    - `IF` — используется старый лоадер. Загрузите SDK в соответствии с [документацией](https://yandex.ru/dev/games/doc/ru/#connect).

## Решение проблем {#faq}

### Uncaught ReferenceError: YaGames is not defined {#yagames-not-defined}

Обратите внимание на порядок подключения скрипта `sdk`: он должен быть подключен до выполнения `YaGames.init().`

### Uncaught ReferenceError: ysdk is not defined {#ysdk-not-defined}

Вы попытались использовать методы SDK (реклама, покупки и т. д.) до момента инициализации SDK. Момент инициализации можно отследить в debug-режиме по сообщению `Initialized` в консоли. Чтобы контролировать порядок вызовов, добавьте инициализацию SDK перед вызовом метода:

```javascript showLineNumbers
const ysdk = await YaGames.init();

ysdk.adv.showFullscreenAdv();
```

### Пример подключения SDK {#connection-example}

```html showLineNumbers
<!-- Yandex Games SDK -->
<script async src="/sdk.js" onload="initSDK()"></script>
<script>
    async function initSDK() {
        const ysdk = await YaGames.init();
        ...
    }
</script>
```

---

{% note info %}

Сотрудники службы поддержки помогают разместить готовую игру на платформе Яндекс Игр. На прикладные вопросы о разработке и тестировании предметно ответят другие разработчики в [сообществе в Телеграме](https://t.me/yagamedev){.telegram} и в [сообществе ВКонтакте](https://vk.ru/yandexgmsdev){.vk}.

{% endnote %}

Если при использовании SDK Яндекс Игр вы столкнулись с проблемой или у вас появился вопрос, обратитесь в службу поддержки:

<a href="https://yandex.ru/chat/#/user/774df508-c12d-9d6e-6a27-5e3fc522016a">
  <span class="button">Написать в чат</span>
</a>
