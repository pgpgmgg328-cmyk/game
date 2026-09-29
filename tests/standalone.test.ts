import { describe, expect, it } from 'vitest';
import { inlineGame } from '../scripts/lib/standalone';

const HTML = `<!doctype html>
<html lang="ru">
  <head>
    <title>Игра</title>
    <!-- Yandex Games SDK -->
    <script src="/sdk.js"></script>
    <script type="module" crossorigin src="./assets/index-1.js"></script>
    <link rel="stylesheet" crossorigin href="./assets/index-2.css">
  </head>
  <body><div id="game"></div></body>
</html>
`;

const FILES: Record<string, string> = {
  'assets/index-1.js': 'const tag = "</script>"; console.log(tag);',
  'assets/index-2.css': '@font-face{src:url(./font-a.woff2)format("woff2")}body{margin:0}',
  'assets/font-a.woff2': 'FONT',
};

function read(path: string): Buffer {
  const content = FILES[path];
  if (content === undefined) throw new Error(`нет файла ${path}`);
  return Buffer.from(content);
}

describe('игра одним файлом', () => {
  it('встраивает код, стили и шрифты, убирает тег SDK', () => {
    const page = inlineGame(HTML, read);
    expect(page).not.toContain('sdk.js');
    expect(page).not.toContain('Yandex Games SDK');
    expect(page).not.toContain('./assets/');
    expect(page).toContain(
      `<style>@font-face{src:url(data:font/woff2;base64,${Buffer.from('FONT').toString('base64')})format("woff2")}body{margin:0}</style>`,
    );
    expect(page).toContain(
      '<script type="module">const tag = "<\\/script>"; console.log(tag);</script>',
    );
    expect(page).toContain('<div id="game"></div>');
  });

  it('незнакомый файл в CSS — ошибка, а не сломанная страница', () => {
    const files: Record<string, string> = {
      ...FILES,
      'assets/index-2.css': 'body{background:url(./photo.png)}',
    };
    expect(() => inlineGame(HTML, (path) => Buffer.from(files[path] ?? ''))).toThrow(
      'Неизвестный файл в CSS',
    );
  });
});
