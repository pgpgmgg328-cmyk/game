<!-- Источник: https://yandex.ru/dev/games/doc/ru/console/debug-panel (текст из https://yandex.ru/dev/games/doc/ru/llms-full.txt), скачано 2026-09-26 -->

# Debug-панель







Debug-панель — это инструмент, с помощью которого вы можете тестировать черновик: отслеживать вызов SDK, эмулировать плохое соединение с интернетом, снять фокус с игры, выключить загрузочный экран Яндекса и т. д.

## Включить debug-панель {#debug-panel-on}

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

Debug-панель появится в левом нижнем углу страницы игры.

## Части debug-панели {#debug-panel-parts}

<div class="colored-header">

#|
|| [IT](https://yandex.ru/dev/games/doc/ru/#loader) | [🟢](https://yandex.ru/dev/games/doc/ru/#game-ready-call) | [⚒️](https://yandex.ru/dev/games/doc/ru/#tools-button) | [文](https://yandex.ru/dev/games/doc/ru/#i18n-button) | [▶️](https://yandex.ru/dev/games/doc/ru/#play-button) | [🎮](https://yandex.ru/dev/games/doc/ru/#gamepad-button) | [⏱️](https://yandex.ru/dev/games/doc/ru/#clock-button) ||
|#

</div>


### Лоадер {#loader}

Лоадер может иметь значения:

#|
|| **Индикатор** | **Текст** | **Значение** ||
|| `W` | — | Ожидает инициализации. ||
|| `IT` | ##Is loader: true## | Загрузчик SDK инициализирован верно. ||
|| `IF` | ##Is loader: false## | Используется старый лоадер. Загружайте SDK в соответствии с [документацией](https://yandex.ru/dev/games/doc/sdk/sdk-about.md#connect) ([пункт 1.19.1](https://yandex.ru/dev/games/doc/concepts/requirements.md#1-19-1) Требований к игре). ||
|#


### Индикатор вызова Game Ready {#game-ready-call}

Наведите указатель на индикатор, чтобы узнать статус SDK в игре и момент [вызова метода](https://yandex.ru/dev/games/doc/sdk/sdk-game-events.md#gameready) `LoadingAPI.ready()` ([пункт 1.19.2](https://yandex.ru/dev/games/doc/concepts/requirements.md#1-19-2) Требований к игре). Может быть фиолетового, зеленого или красного цвета:

<div class="table-25">

#|
|| **Индикатор** | **Текст** | **Значение** ||
|| Мигает фиолетовым ![SVG](https://yandex.ru/dev/games/doc/_images/debug-panel/gra-purple.svg) | ##SDK is not initialized. Wait for "unit" call.## | Игра ожидает инициализации SDK. ||
|| Мигает фиолетовым ![SVG](https://yandex.ru/dev/games/doc/_images/debug-panel/gra-purple.svg) | ##The game has initialized the SDK. Waiting for call "ready".## | Игра инициализировала SDK и теперь ожидает вызова метода `LoadingAPI.ready()`. Время ожидания Game Ready — 90 секунд. ||
|| Стал зеленым ![SVG](https://yandex.ru/dev/games/doc/_images/debug-panel/gra-green.svg) | ##The game called ready after … ms.## | Метод `LoadingAPI.ready()` вызван через указанное количество миллисекунд. ||
|| Стал красным ![SVG](https://yandex.ru/dev/games/doc/_images/debug-panel/gra-red.svg) | ##\"ready" called on timeout.## | Game Ready в игре не был вызван через 90 секунд ожидания. В этом случае считается, что Game Ready не используется в игре. ||
|#

</div>

{% cut "**Почему видно ошибку SDK is not defined, хотя индикатор Game Ready показывает, что SDK инициализирован?**" %} {#error}

Важно правильно инициализировать SDK: cкрипт `/sdk.js` должен быть подключен до выполнения [YaGames.init()](https://yandex.ru/dev/games/doc/sdk/sdk-about.md#use). Индикатор Game Ready регистрирует только то, [установлен](https://yandex.ru/dev/games/doc/sdk/sdk-about.md#connect) ли SDK в игре, подключен ли нужный скрипт.

{% endcut %}


### Кнопка инструментов SDK mocks ⚒️ {#tools-button}

#### Параметр выбора языка {#lang}

Эта функция позволяет поменять язык, который автоматически определяется для игры.

В выпадающем списке с обозначением языка (например, **En** ![SVG](https://yandex.ru/dev/games/doc/_images/debug-panel/choose-game-lang-arrow.svg)) выберите нужный. Игра откроется на этом языке в новой вкладке.

Подробнее см. [методику проверки](https://yandex.ru/dev/games/doc/requirements/2/14.md) пункта 2.14 Требований к игре.

#### Иконка ссылки: 🔗 **Game links mock is disabled** / 🔗 **Game links mock is enabled** {#link-icon}

С помощью этого параметра проверяется соблюдение [пункта 8.4.1](https://yandex.ru/dev/games/doc/concepts/requirements.md#8-4-1) Требований к игре. Он считается выполненным, если в режиме проверки вместо ссылок на другие игры открывается статическая страница. Подробнее см. [методику проверки](https://yandex.ru/dev/games/doc/requirements/8/4/1.md).

Чтобы включить или отключить режим проверки:

1. Выберите 🔗 **Game links mock is disabled** или 🔗 **Game links mock is enabled** соответственно.
2. Подождите 5 секунд и перезагрузите игру.

#### Иконка глаза: 👁 **Remove the focus from the game** / 👀 **Return the focus to the game** {#eye-icon}

Нажмите кнопку, чтобы снять фокус с игры или вернуть его обратно. Это полезно для отладки и тестирования игры.

#### Иконка ракеты или черепахи: 🚀 **Network throttling is disabled** / 🐢 **Network throttling is enabled** {#rocket-turtle-icon}

Ракета и черепаха изменяют время ожидания ответа от сервера. Нажмите эту кнопку, чтобы переключиться между разными режимами:

- В режиме ракеты время ожидания ответа от сервера стандартное. Игра работает в штатном режиме.

- В режиме черепахи клиент требует ответ от сервера сразу. Если за короткое время нет ответа, игра считает, что сервер не ответил. Этот режим используется при тестировании игры для эмуляции ошибки. Например, если нужно протестировать игру при плохом интернет-соединении, или чтобы эмулировать ошибку при покупке, если сервер SDK не ответит вовремя.

#### Иконка валюты: 🪙 **Currency mock is disabled** / 🪙 **Currency mock is enabled** {#currency-icon}

Эта настройка эмулирует валюту в игре (название и иконку).

Чтобы проверить, что обозначение валюты в игре берется из SDK:

1. Выберите **Currency mock is enabled**.
1. Подождите 5 секунд и перезагрузите игру.
1. Проверьте, что обозначение валюты в игре сменилось на [моковое](https://yandex.ru/dev/games/doc/ru/*currency_mock). Если валюта:

    - Изменилась — в игре корректно используются методы SDK для обозначения портальной валюты (соблюдается [пункт 1.13.2](https://yandex.ru/dev/games/doc/concepts/requirements.md#1-13-2) Требований к игре).
    - Не изменилась — в игре не используются методы для обозначения портальной валюты, и нарушается [пункт 1.13.2](https://yandex.ru/dev/games/doc/concepts/requirements.md#1-13-2) Требований к игре. Такую игру модераторы отклонят. Нужно обозначить название и иконку валюты в соответствии с [документацией](https://yandex.ru/dev/games/doc/requirements/1/13.md#currency-detection).

Чтобы вернуться к стандартным обозначениям валюты, выберите **Currency mock is disabled** и обновите страницу с игрой.

#### Иконка облака: ☁️ **Clear cloud data** {#cloud-icon}

Очищает сохраненные данные и статистику игрока.

Кнопка вызывает методы [player.setData()](https://yandex.ru/dev/games/doc/sdk/sdk-player.md#setdata) и [player.setStats()](https://yandex.ru/dev/games/doc/sdk/sdk-player.md#setstats) с пустыми значениями.

После сброса игра запускается как в первый раз — это удобно для тестирования онбординга и начального игрового опыта.


### Индикатор языка 文 {#i18n-button}

Индикатор 文 помогает проверить, что в игре работает автоопределение языка через [SDK Яндекс Игр](https://yandex.ru/dev/games/doc/sdk/sdk-environment.md#structure-i18n).

#|
|| **Фон** | **Текст** | **Значение** ||
|| ![SVG](https://yandex.ru/dev/games/doc/_images/debug-panel/i18n-on.svg) | ##I18N is used## | Автоопределение подключено. ||
|| ![SVG](https://yandex.ru/dev/games/doc/_images/debug-panel/i18n-off.svg) | ##I18N is not used## | Автоопределение не подключено. ||
|#

Подробнее см. [методику проверки](https://yandex.ru/dev/games/doc/requirements/2/14.md) пункта 2.14 Требований к игре.


### Кнопка Play ▶️ {#play-button}

Кнопка Play — это индикатор активности игры. Посредством событий `game_api_pause` и `game_api_resume` платформа сообщает, когда игре нужно встать на паузу или продолжить игровой опыт.

Нажмите кнопку, чтобы имитировать работу событий:

- ▶️ — игра в фокусе, идет игровой процесс.
- ⏸️ — игра не в фокусе, открыто окно покупок или идет показ рекламы.


### Кнопка геймпада 🎮 {#gamepad-button}

Кнопка геймпада 🎮 эмулирует использование [методов SDK](https://yandex.ru/dev/games/doc/sdk/sdk-game-events.md#gameplay) `GameplayAPI.start()` и `GameplayAPI.stop()` ([пункт 1.19.3](https://yandex.ru/dev/games/doc/concepts/requirements.md#1-19-3) Требований к игре). Нажмите ее, чтобы переключиться между состояниями:

- Темный фон ![SVG](https://yandex.ru/dev/games/doc/_images/debug-panel/gameplay-none.svg) (по умолчанию) — геймплей не использован в игре.
- Зеленый фон ![SVG](https://yandex.ru/dev/games/doc/_images/debug-panel/gameplay-on.svg) — геймплей в процессе.
- Красный фон ![SVG](https://yandex.ru/dev/games/doc/_images/debug-panel/gameplay-off.svg) — геймплей на паузе.


### Кнопка часов ⏱️ {#clock-button}

Нажмите на часы ⏱️, чтобы включить и выключить прозрачность загрузочного экрана Яндекса:

- **Mute Game loader** — прозрачность выключится, при старте игры отобразится загрузочный экран с иконкой игры в центре.
- **Show Game loader** — прозрачность включится, загрузочная иконка игры станет прозрачной. Можно посмотреть, что происходит с игрой во время загрузки.

[*currency_mock]: Моковая валюта — это условная валюта для тестирования, которую отдает сервер. Модераторы как моковую валюту используют текстовое обозначение TST и иконку йены ¥.
