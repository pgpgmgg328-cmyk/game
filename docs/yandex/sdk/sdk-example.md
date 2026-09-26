<!-- Источник: https://yandex.ru/dev/games/doc/ru/sdk/sdk-example (текст из https://yandex.ru/dev/games/doc/ru/llms-full.txt), скачано 2026-09-26 -->

# Пример







Ниже приведены примеры настройки SDK Яндекс Игр при синхронном и асинхронном подключении.

{% list tabs %}

- Синхронное подключение

    Особенности примера:
    - Для первого вызова рекламы [callback-функции](https://yandex.ru/dev/games/doc/ru/*key_callback) не заданы.
    - Для второго и всех последующих вызовов заданы все возможные callback-функции.
    - Кнопке **Показать рекламу** присвоен обработчик события `'click'` (вызов рекламы при каждом нажатии кнопки).

    ```html showLineNumbers
    <!DOCTYPE html>
    <html>
        <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
            <meta name="mobile-web-app-capable" content="yes" />
            <meta name="apple-mobile-web-app-capable" content="yes" />
            <title>Пример страницы с синхронным подключением SDK</title>
            <script src="/sdk.js"></script>
            <script>
                YaGames.init()
                    .then((ysdk) => {
                        ysdk.adv.showFullscreenAdv();

                        const buttonElem = document.querySelector('#button');

                        let commonCounter = 0;
                        buttonElem.addEventListener('click', () => {
                            let counter = 0;

                            function getCallback(callbackName) {
                                return () => {
                                    counter += 1;
                                    commonCounter += 1;

                                    console.log(`showFullscreenAdv; callback ${callbackName}; ${counter} call`);
                                };
                            }

                            ysdk.adv.showFullscreenAdv({
                                callbacks: {
                                    onClose: getCallback('onClose'),
                                    onOpen: getCallback('onOpen'),
                                    onError: getCallback('onError')
                                }
                            });
                        });
                    });
            </script>
        </head>
        <body>
            <button id="button">Показать рекламу</button>
        </body>
    </html>
    ```

- Асинхронное подключение

    Особенности примера:
    - Для первого вызова рекламы задана callback-функция [onClose](https://yandex.ru/dev/games/doc/ru/*key_onClose).
    - Для второго и последующих вызовов заданы все возможные [callback-функции](https://yandex.ru/dev/games/doc/ru/*key_callback).
    - В callback-функцию `onClose` добавлен код, который будет выполняться после закрытия рекламного блока.
    - Все ошибки, возникающие при работе SDK или при выполнении callback-функций, передаются функции [onError](https://yandex.ru/dev/games/doc/ru/*key_onError).
    - Кнопке **Показать рекламу** присвоен обработчик события `'click'` (вызов рекламы при каждом нажатии кнопки).

    ```html showLineNumbers
    <!DOCTYPE html>
    <html>
        <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
            <meta name="mobile-web-app-capable" content="yes" />
            <meta name="apple-mobile-web-app-capable" content="yes" />
            <title>Пример страницы с асинхронным подключением SDK</title>
            <script>
                let ysdk;

                function initSDK() {
                    YaGames.init()
                        .then((ysdk_) => {
                            ysdk = ysdk_;
                            ysdk.adv.showFullscreenAdv({
                                callbacks: {
                                    onClose: (wasShown) => {
                                        console.info('First close');
                                    }
                                }
                            });
                        });
                }

                document.addEventListener('DOMContentLoaded', () => {
                    const buttonElem = document.querySelector('#button');

                    let commonCounter = 0;
                    buttonElem.addEventListener('click', () => {
                        let counter = 0;

                        function getCallback(callbackName) {
                            return () => {
                                counter += 1;
                                commonCounter += 1;

                                if (commonCounter % 3 === 0) {
                                    throw new Error(`Test error in ${callbackName}, everything okay, it should not abort other code execution`);
                                }

                                console.info(`showFullscreenAdv; callback ${callbackName}; ${counter} call`);
                            };
                        }

                        function makeSomethingImportant() {
                            console.info('It\'s very important \'console.info\'');
                        }

                        if (ysdk) {
                            ysdk.adv.showFullscreenAdv({
                                callbacks: {
                                    onClose: makeSomethingImportant,
                                    onOpen: getCallback('onOpen'),
                                    onError: function (error) {
                                        console.error(error);
                                    }
                                }
                            });
                        } else {
                            makeSomethingImportant();
                        }
                    });
                });
            </script>
        </head>
        <body>
            <!-- Yandex Games SDK -->
            <script>
                (function (d) {
                    var t = d.getElementsByTagName('script')[0];
                    var s = d.createElement('script');
                    s.src = '/sdk.js';
                    s.async = true;
                    t.parentNode.insertBefore(s, t);
                    s.onload = initSDK;
                })(document);
            </script>
            <button id="button">Показать рекламу</button>
        </body>
    </html>
    ```

{% endlist %}

[*key_callback]: - `onClose` — вызывается при закрытии рекламы, после ошибки, а также, если реклама не открылась по причине слишком частого вызова. Используется с аргументом `wasShown` (тип: `boolean`), по значению которого можно узнать была ли показана реклама.
- `onOpen` — вызывается при успешном открытии рекламы.
- `onError` — вызывается при возникновении ошибки. Объект ошибки передается в callback-функцию.

[*key_onClose]: `onClose` — вызывается при закрытии рекламы, после ошибки, а также, если реклама не открылась по причине слишком частого вызова. Используется с аргументом `wasShown` (тип: `boolean`), по значению которого можно узнать была ли показана реклама.

[*key_onError]: `onError` — вызывается при возникновении ошибки. Объект ошибки передается в callback-функцию.

[*key_onOpen]: `onOpen` — вызывается при успешном открытии рекламы.
