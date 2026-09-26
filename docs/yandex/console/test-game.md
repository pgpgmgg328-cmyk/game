<!-- Источник: https://yandex.ru/dev/games/doc/ru/console/test-game (текст из https://yandex.ru/dev/games/doc/ru/llms-full.txt), скачано 2026-09-26 -->

# Тестирование







#|
|| ![SVG](https://yandex.ru/dev/games/doc/_images/icons/video.svg) | Видеоурок. Как протестировать игру в Яндекс Играх и отправить её на модерацию?

<div class="cut-button">

{% cut "Посмотреть видео" %}

{% list tabs %}

- Яндекс

  @[](https://runtime.strm.yandex.ru/player/video/vplvbgrdjiy6d3lfyeeb?autoplay=0&mute=0)

- YouTube

  @[youtube](https://www.youtube.com/embed/pbZGF-_AU90)

{% endlist %}

{% endcut %}

</div>

||
|#

Перед публикацией в каталоге каждая игра обязательно проходит модерацию — проверку на соответствие [требованиям](https://yandex.ru/dev/games/doc/concepts/requirements.md). Вы также можете самостоятельно протестировать игру, пока она находится в процессе разработки или после загрузки архива на сервер Яндекса.

После публикации игры вы можете заходить в нее как обычный игрок.

## Способы тестирования {#testing-methods}

<div class="striped-none colored-header">

#|
|| **Способ** | **Когда подходит** | **Где хранятся файлы игры** | **Взаимодействие с платформой** ||
|| [Dev-окружение](https://yandex.ru/dev/games/doc/concepts/local-launch.md#dev-env) |::{align="center"} На этапе активной разработки и отладки игровой логики. |::{align="center"} Локально |::{align="center"} Нет ||
|| [Prod-окружение](https://yandex.ru/dev/games/doc/concepts/local-launch.md#prod-env) |::{align="center"} На этапе финальной проверки игры перед отправкой на модерацию. | ^ |::{align="center"} Да ||
|| [Режим черновика](https://yandex.ru/dev/games/doc/ru/draft-mode.md) | ^ |::{align="center"} На сервере Яндекса | ^ ||
|#

</div>

## Инструменты отладки {#debugging-tools}

- [Debug-панель](https://yandex.ru/dev/games/doc/console/debug-panel.md) помогает проверить выполнение основных требований к использованию SDK.
- [Performance в DevTools](https://yandex.ru/dev/games/doc/concepts/performance.md) помогает анализировать производительность (метрики Game Ready и Time To Interactive).

## Частые вопросы {#faq}

{% cut "**Как протестировать покупки?**" %} {#testing-purchases}

Для тестирования покупок авторизуйтесь под аккаунтом, который вы [добавили](https://yandex.ru/dev/games/doc/console/purchases.md#test) в **Список логинов для тестовых покупок**. В этом случае все платежи в игре будут считаться тестовыми и плата за них взиматься не будет.

{% endcut %}

{% cut "**Можно ли тестировать игру на ТВ?**" %} {#tv-testing}

Да.

Подробнее см. в разделе [Тестирование игры](https://yandex.ru/dev/games/doc/requirements/1/6/3.md#game-test).

{% endcut %}

{% cut "**Как проверить, запускается ли моя игра во всех браузерах и ОС?**" %} {#browser-os-testing}

[Добавьте игру](https://yandex.ru/dev/games/doc/console/add-new-game.md) через Консоль и отправьте ее на модерацию. Модераторы проверят игру на всех браузерах и ОС, перечисленных в [требованиях](https://yandex.ru/dev/games/doc/concepts/requirements.md) в порядке очереди.

Если игра будет некорректно запускаться в одном из браузеров и/или ОС, перечисленных в требованиях, модерация отклонит игру. На почту, указанную в Яндекс ID, будет отправлено уведомление с подробным описанием причин отклонения.

{% endcut %}

{% cut "**Как проверить, правильно ли я настроил вызов рекламы в своей игре?**" %} {#adv-sdk}

Убедитесь, что выполнены все условия:
1. Вы добавили [код SDK](https://yandex.ru/dev/games/doc/sdk/sdk-adv.md) в исходные файлы игры.
1. В Консоли вы [загрузили](https://yandex.ru/dev/games/doc/console/update-game.md) новую версию игры, и она успешно прошла модерацию.
1. У вас договор по [единой лицензионной схеме](https://yandex.ru/dev/games/doc/payments.md) или вы [подключили монетизацию](https://yandex.ru/dev/games/doc/console/adv-monetization.md#enable-int-monetization) через РСЯ.

Если все пункты выполнены, для каждой добавленной игры с SDK автоматически создается рекламный блок. Протестировать игру и проверить наличие рекламы можно самостоятельно:
1. В Консоли разработчика откройте [список игр](https://games.yandex.ru/console/applications){.external}.
1. Найдите игру, в которой хотите проверить рекламу.
1. Откройте игру: справа нажмите ![SVG](https://yandex.ru/dev/games/doc/_images/icons/game-link.svg).

{% note info %}

В связи с ограничениями нашего хостинга реклама может не показываться локально на устройстве. Однако учет показов и переходов по рекламным блокам начинается сразу же после добавления в игры.

Если вы работаете не по [единой лицензионной схеме](https://yandex.ru/dev/games/doc/payments.md), статистические отчеты по рекламным блокам доступны в [партнерском интерфейсе РСЯ](https://partner.yandex.ru/){.external}.

В [Консоли](https://games.yandex.ru/console){.external} на вкладке **Метрики** → **Метрики монетизации** можно посмотреть [доход и среднее количество показов на игрока](https://yandex.ru/dev/games/doc/concepts/metric.md#monetization). Данные по рекламным доходам обновляются с задержкой в 2–3 дня.

{% endnote %}


{% endcut %}
