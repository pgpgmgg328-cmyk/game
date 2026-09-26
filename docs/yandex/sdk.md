<!-- Источник: https://yandex.ru/dev/games/doc/ru/sdk (текст из https://yandex.ru/dev/games/doc/ru/llms-full.txt), скачано 2026-09-26 -->

# SDK







{% note warning %}

Подключение SDK необходимо для успешного прохождения модерации и публикации игры.

{% endnote %}

SDK Яндекс Игр — это библиотека, позволяющая сторонним разработчикам подключить свои игры к платформе Яндекс Игр. Библиотека помогает:
- настроить игру в соответствии с [требованиями платформы](https://yandex.ru/dev/games/doc/ru/concepts/requirements.md);
- использовать возможности платформы, например:
    - добавить в игру [рекламу](https://yandex.ru/dev/games/doc/ru/console/adv-monetization.md) и [инап-покупки](https://yandex.ru/dev/games/doc/ru/console/purchases.md);
    - управлять параметрами игры [без обновления билда](https://yandex.ru/dev/games/doc/ru/config.md);
    - сохранять [прогресс игрока](https://yandex.ru/dev/games/doc/ru/sdk/sdk-player.md);
    - подключить [лидерборды](https://yandex.ru/dev/games/doc/ru/concepts/leaderboards.md).
- синхронизировать время в игре с [временем на сервере](https://yandex.ru/dev/games/doc/ru/sdk/sdk-server-time.md) и использовать его для добавления наград и активностей, а также защиты от накруток;
- настроить автоматический переход игры в [полноэкранный режим](https://yandex.ru/dev/games/doc/ru/sdk/sdk-params.md#screen.fullscreen);
- предложить пользователю [оценить игру](https://yandex.ru/dev/games/doc/ru/sdk/sdk-review.md) или установить [иконку игры на рабочий стол](https://yandex.ru/dev/games/doc/ru/sdk/sdk-shortcut.md).

## Подключение {#connection}

Вы можете подключить SDK:

- [напрямую](https://yandex.ru/dev/games/doc/ru/sdk/sdk-about.md) через код игры;
- с помощью [плагинов](https://yandex.ru/dev/games/doc/ru/#official-plugins) для популярных движков.

{% note info %}

Методы SDK Яндекс Игр и способы его интеграции едины для всех движков, которые умеют обращаться к JavaScript и поддерживают HTML5. Подробнее о подключении см. в разделе [Подключение и использование](https://yandex.ru/dev/games/doc/ru/sdk/sdk-about.md).

{% endnote %}

## Плагины для игровых движков {#official-plugins}

Выберите подходящий плагин для подключения SDK в зависимости от используемого игрового движка.

<div class="container-desktop striped-none">

#|
||::{align="center"} [![SVG](https://yandex.ru/dev/games/doc/ru/_images/engeens-logo/unity.svg)](sdk/unity/install.md)

[Unity](https://yandex.ru/dev/games/doc/ru/sdk/unity/install.md) |::{align="center"} [![SVG](https://yandex.ru/dev/games/doc/ru/_images/engeens-logo/cocos.svg)](sdk/cocos/install.md)

[Cocos Creator](https://yandex.ru/dev/games/doc/ru/sdk/cocos/install.md) |::{align="center"} [![SVG](https://yandex.ru/dev/games/doc/ru/_images/engeens-logo/construct-3.svg)](sdk/construct-3/about.md)

[Construct 3](https://yandex.ru/dev/games/doc/ru/sdk/construct-3/about.md) |::{align="center"} [![SVG](https://yandex.ru/dev/games/doc/ru/_images/engeens-logo/defold.svg)](sdk/defold/install.md)

[Defold](https://yandex.ru/dev/games/doc/ru/sdk/defold/install.md) |::{align="center"} [![SVG](https://yandex.ru/dev/games/doc/ru/_images/engeens-logo/typescript.svg)](sdk/typescript.md)

[Typescript](https://yandex.ru/dev/games/doc/ru/sdk/typescript.md) ||
|#

</div>

<div class="container-mobile striped-none">

#|
||::{align="center"} [![SVG](https://yandex.ru/dev/games/doc/ru/_images/engeens-logo/unity.svg)](sdk/unity/install.md)

[Unity](https://yandex.ru/dev/games/doc/ru/sdk/unity/install.md) | > |::{align="center"} [![SVG](https://yandex.ru/dev/games/doc/ru/_images/engeens-logo/cocos.svg)](sdk/cocos/install.md)

[Cocos Creator](https://yandex.ru/dev/games/doc/ru/sdk/cocos/install.md) | > |::{align="center"} [![SVG](https://yandex.ru/dev/games/doc/ru/_images/engeens-logo/construct-3.svg)](sdk/construct-3/about.md)

[Construct 3](https://yandex.ru/dev/games/doc/ru/sdk/construct-3/about.md) | > ||

||::{align="center"} [![SVG](https://yandex.ru/dev/games/doc/ru/_images/engeens-logo/defold.svg)](sdk/defold/install.md)

[Defold](https://yandex.ru/dev/games/doc/ru/sdk/defold/install.md) | > | > |::{align="center"} [![SVG](https://yandex.ru/dev/games/doc/ru/_images/engeens-logo/typescript.svg)](sdk/typescript.md)

[Typescript](https://yandex.ru/dev/games/doc/ru/sdk/typescript.md) | > | > ||
|#

</div>

## Сторонние плагины для игровых движков {#other-plugins}

Вы можете использовать плагины, которые не описаны в документации Яндекс Игр.

<div class="striped-none">

#|
|| **Gamepush**

SDK для кросс-платформенной публикации игр на HTML5.

- [Сайт](https://gamepush.com/){.external}.
- Контакты разработчика: [Телеграм](https://t.me/gs_community){.telegram}. ||

|| **Playgama Bridge**

SDK для кросс-платформенной публикации игр на HTML5.

- [Репозиторий](http://github.com/playgama/bridge){.external}.
- Контакты разработчика: [Телеграм](https://t.me/playgama_bridge){.telegram}. ||

|| **Defold**

- [Репозиторий](https://github.com/indiesoftby/defold-yagames){.external}.
- Контакты разработчика: [Телеграм](https://t.me/aglitchman){.telegram}. ||
|#

</div>

Если вы хотите поделиться своими разработками с сообществом, заполните [форму](https://forms.yandex.ru/u/607065cfe2ea662c4dc04ca7/){.external}. Мы рассмотрим вашу заявку и возможность разместить информацию о ваших плагинах в этом разделе.

---

{% note info %}

Сотрудники службы поддержки помогают разместить готовую игру на платформе Яндекс Игр. На прикладные вопросы о разработке и тестировании предметно ответят другие разработчики в [сообществе в Телеграме](https://t.me/yagamedev){.telegram} и в [сообществе ВКонтакте](https://vk.ru/yandexgmsdev){.vk}.

{% endnote %}

Если при использовании SDK Яндекс Игр вы столкнулись с проблемой или у вас появился вопрос, обратитесь в службу поддержки:

<a href="https://yandex.ru/chat/#/user/774df508-c12d-9d6e-6a27-5e3fc522016a">
  <span class="button">Написать в чат</span>
</a>
