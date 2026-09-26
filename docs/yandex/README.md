# Документация Яндекс Игр (снимок)

Скачано 26.09.2026 с https://yandex.ru/dev/games/doc/ru/. Страница требований к игре на этот момент обновлена Яндексом 22.09.2026.

Это первоисточник для CLAUDE.md: если правило в проекте расходится с этими файлами, верны эти файлы (или ещё более свежая версия на сайте).

## Откуда взят текст

- Текст каждой страницы взят из официальной сводки `https://yandex.ru/dev/games/doc/ru/llms-full.txt` и разрезан по страницам. Адрес страницы на сайте указан в первой строке каждого файла.
- Отдельные markdown-версии страниц (`<адрес страницы>.md`) не подошли: в них вырезаны теги `<script>` вместе с соседним текстом, например пропал пример подключения `/sdk.js`.
- В `llms-full.txt` подсказки внутри блоков кода превращены в ссылки вида `[callbacks](https://yandex.ru/dev/games/doc/ru/*key_callbacks)`. Внутри блоков кода они заменены обратно на простой текст (`callbacks`), чтобы примеры кода совпадали с сайтом. Больше текст не менялся.
- Все блоки кода сверены с HTML-версиями страниц: совпадают на всех 54 страницах.
- Ссылки внутри текста местами неточные (так в исходнике). Если нужна точная ссылка, открывайте страницу по адресу из первой строки файла.
- Структура папок повторяет адреса на сайте: `sdk/sdk-adv.md` — это `https://yandex.ru/dev/games/doc/ru/sdk/sdk-adv`.

## Что где лежит

| Тема (из CLAUDE.md) | Файлы |
|---|---|
| Требования к игре | `concepts/requirements.md` — весь список; `requirements/…` — пояснения и методики проверки к отдельным пунктам (номер пункта = путь, например `requirements/1/13.md` — пункт 1.13) |
| SDK: подключение | `sdk.md`, `sdk/sdk-about.md`, `sdk/sdk-example.md`, `sdk/typescript.md` |
| Загрузка игры и разметка геймплея | `sdk/sdk-game-events.md` |
| События (пауза, реклама на старте, выбор аккаунта) | `sdk/sdk-events.md` |
| Данные игрока, авторизация, лимиты запросов | `sdk/sdk-player.md` |
| Реклама | `sdk/sdk-adv.md`, `console/adv-monetization.md` |
| Покупки | `sdk/sdk-purchases.md`, `console/purchases.md` |
| Лидерборды | `sdk/sdk-leaderboard.md`, `concepts/leaderboards.md` |
| Окружение и язык | `sdk/sdk-environment.md`, `concepts/languages-and-domains.md` |
| Отзывы | `sdk/sdk-review.md` |
| Ярлык на рабочий стол | `sdk/sdk-shortcut.md` |
| Remote config (флаги) | `sdk/sdk-config.md`, `config.md` |
| Серверное время | `sdk/sdk-server-time.md` |
| Прочие объекты SDK | `sdk/sdk-params.md` |
| Локальный запуск, dev-режим, `purchases-catalog.json` | `concepts/local-launch.md` |
| Консоль: загрузка игры, черновик, тестирование, debug-панель | `console/add-new-game.md`, `console/add-new-game/draft.md`, `console/test-game.md`, `console/draft-mode.md`, `console/debug-panel.md` |
| Модерация и быстрый старт | `concepts/moderation.md`, `concepts/quick-start.md` |

## Как обновить

Попросить Claude заново скачать `docs/yandex/`: тем же способом, с той же сверкой блоков кода. Перед отправкой игры на модерацию стоит обновить снимок и сравнить дату изменения на странице требований.
