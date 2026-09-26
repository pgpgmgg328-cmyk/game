<!-- Источник: https://yandex.ru/dev/games/doc/ru/sdk/typescript (текст из https://yandex.ru/dev/games/doc/ru/llms-full.txt), скачано 2026-09-26 -->

# TypeScript







Чтобы добавить SDK в игру, разработанную на TypeScript:

1. Установите `npm`, следуя инструкциям на сайте [Node.JS](https://nodejs.org/en/){.external}.
1. Для типизации SDK установите пакет [@types/ysdk](https://www.npmjs.com/package/@types/ysdk){.external}:

    ```console
    npm install --save @types/ysdk
    ```

1. Импортируйте в файлы проекта требуемые типы модулей SDK. Например, импортировать типы `ysdk` и `player` можно так:

    ```typescript showLineNumbers
    // Импорт необходимых типов модулей SDK.
    import type { SDK, Player } from 'ysdk';

    ...

    // Пример использования SDK с типизацией.
    const ysdk: SDK = await YaGames.init();
    const player: Player = await ysdk.getPlayer();
    ```

---


{% note info %}

Если при работе с плагином вы столкнулись с проблемой или у вас появился вопрос, обратитесь в [сообщество в Телеграме](https://t.me/yagamedev){.telegram} или в [сообщество ВКонтакте](https://vk.ru/yandexgmsdev){.vk}.

{% endnote %}


<a href="https://www.npmjs.com/package/@types/ysdk">
  <span class="button">Репозиторий</span>
</a>
