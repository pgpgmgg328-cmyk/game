<!-- Источник: https://yandex.ru/dev/games/doc/ru/sdk/sdk-config (текст из https://yandex.ru/dev/games/doc/ru/llms-full.txt), скачано 2026-09-26 -->

# Удаленная конфигурация







Чтобы получить удаленную конфигурацию флагов (Remote Config), используйте метод `ysdk.getFlags()` из SDK Яндекс Игр. Рекомендуем запрашивать флаги один раз на старте игры.

**Сигнатура и интерфейсы метода** {#signature-and-interfaces}

```typescript showLineNumbers
interface IFlags {
    [key: string]: string;
}

interface IClientFeature {
    name: string;
    value: string;
}

interface IGetFlagsParams {
    defaultFlags?: IFlags;
    clientFeatures?: IClientFeature[];
}

function getFlags(getFlagsParams: IGetFlagsParams = {}): IFlags {}
```

Принимает параметры:

<div class="table-25 table-2c25">

#|
|| **Параметр** | **Тип** | **Описание** ||
|| `name` | `string` | Название клиентского параметра. ||
|| `value` | `string` | Значение клиентского параметра. ||
|| `defaultFlags` | `IFlags` | [Локальная конфигурация](https://yandex.ru/dev/games/doc/ru/#local-config): плоский объект с парами «ключ — значение». Соответствует удаленной конфигурации, [заданной](https://yandex.ru/dev/games/doc/config.md) в Консоли. ||
|| `clientFeatures` | `IClientFeature[]` | Массив с [клиентскими параметрами](https://yandex.ru/dev/games/doc/ru/#client-params). Содержит [данные игрока](https://yandex.ru/dev/games/doc/sdk/sdk-player.md#profile-data). ||
|#

</div>

#### Пример {#example-getflags}

```javascript showLineNumbers
const ysdk = await YaGames.init();

const flags = await ysdk.getFlags(); // Метод возвращает объект с флагами.

// В логике игры можно добавить условие:
if (flags.difficult === 'hard') {
    // Включаем высокую сложность.
}
```

## Локальная конфигурация {#local-config}

{% note tip %}

Всегда добавляйте локальную конфигурацию флагов в код игры на случай, если не удастся получить удаленную конфигурацию с сервера (например, из-за проблем с интернет-соединением).

{% endnote %}

Чтобы добавить локальную конфигурацию (плоский объект, значения — строки), нужно передать ее в дополнительный параметр метода `ysdk.getFlags()`, в поле `defaultFlags`. Полученный в итоге объект является объединением удаленной и локальной конфигураций. Приоритет удаленной конфигурации выше.

#### Пример {#example-local-config}

```javascript showLineNumbers
const ysdk = await YaGames.init();

const flags = await ysdk.getFlags({ defaultFlags: { difficult: 'easy' } });

if (flags.difficult === 'easy') {

}
```

## Клиентские параметры {#client-params}

Если ваша игра хранит [данные игрока](https://yandex.ru/dev/games/doc/ru/sdk-player.md) (пройденные уровни, опыт, инап-покупки и т. д.), то их можно использовать в удаленной конфигурации. Подробнее о том, как настроить флаг в зависимости от условий, см. в разделе [Шаг 1. Создайте конфигурацию флагов](https://yandex.ru/dev/games/doc/config.md#create-flag-config).

Клиентские параметры нужно передавать в виде массива в поле `clientFeatures` метода `ysdk.getFlags()`.

#### Пример {#example-client-params}

```javascript showLineNumbers
const ysdk = await YaGames.init();

const player = await ysdk.getPlayer();

const payingStatus = player.getPayingStatus();

// Запрашиваем флаги с клиентским параметром статуса платежной активности пользователя.
const flags = await ysdk.getFlags({
    clientFeatures: [{ name: 'payingStatus', value: payingStatus }]
});
```

---

{% note info %}

Сотрудники службы поддержки помогают разместить готовую игру на платформе Яндекс Игр. На прикладные вопросы о разработке и тестировании предметно ответят другие разработчики в [сообществе в Телеграме](https://t.me/yagamedev){.telegram} и в [сообществе ВКонтакте](https://vk.ru/yandexgmsdev){.vk}.

{% endnote %}

Если при использовании SDK Яндекс Игр вы столкнулись с проблемой или у вас появился вопрос, обратитесь в службу поддержки:

<a href="https://yandex.ru/chat/#/user/774df508-c12d-9d6e-6a27-5e3fc522016a">
  <span class="button">Написать в чат</span>
</a>
