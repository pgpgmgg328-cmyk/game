/**
 * Один HTML-файл с игрой: код, стили и шрифты встроены в страницу, её можно открыть двойным
 * щелчком без сервера. Это для локальной игры и показа; в Яндекс Игры загружается архив
 * (`npm run zip`) — в нём остаётся тег `/sdk.js`.
 */

/** Как файл шрифта записать в data:-адрес. */
const FONT_TYPES: Readonly<Record<string, string>> = {
  woff2: 'font/woff2',
  woff: 'font/woff',
  ttf: 'font/ttf',
};

/** Прочитать файл из dist/ по пути вида `assets/index.css`. */
export type ReadAsset = (path: string) => Buffer;

function assetPath(href: string): string {
  return href.replace(/^\.\//, '');
}

/** Шрифты в CSS — data:-адресами (пути в CSS считаются от папки самого CSS). */
function inlineFonts(css: string, cssPath: string, read: ReadAsset): string {
  const folder = cssPath.includes('/') ? cssPath.slice(0, cssPath.lastIndexOf('/') + 1) : '';
  return css.replace(/url\(([^)]+)\)/g, (match: string, raw: string) => {
    const url = raw.trim().replace(/^["']|["']$/g, '');
    if (url.startsWith('data:')) return match;
    const extension = url.split('.').pop()?.toLowerCase() ?? '';
    const type = FONT_TYPES[extension];
    if (!type) throw new Error(`Неизвестный файл в CSS: ${url}`);
    const data = read(folder + assetPath(url)).toString('base64');
    return `url(data:${type};base64,${data})`;
  });
}

/**
 * Встраивает в index.html из dist/ стили (со шрифтами) и код. Тег SDK Яндекса убирается:
 * без него игра сама переходит на локальную площадку (сохранения в браузере).
 */
export function inlineGame(html: string, read: ReadAsset): string {
  let page = html.replace(/[ \t]*<!-- Yandex Games SDK -->\r?\n/, '');
  page = page.replace(/[ \t]*<script src="\/sdk\.js"><\/script>\r?\n/, '');
  if (page.includes('/sdk.js')) throw new Error('Не удалось убрать тег /sdk.js');

  page = page.replace(
    /<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g,
    (_tag: string, href: string) => {
      const path = assetPath(href);
      return `<style>${inlineFonts(read(path).toString('utf8'), path, read)}</style>`;
    },
  );
  page = page.replace(
    /<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g,
    (_tag: string, src: string) => {
      // «</script» внутри кода закрыл бы тег раньше времени; «<\/script» в JS означает то же самое.
      const code = read(assetPath(src))
        .toString('utf8')
        .replace(/<\/script/gi, '<\\/script');
      return `<script type="module">${code}</script>`;
    },
  );
  if (/(?:src|href)="\.\/assets\//.test(page)) {
    throw new Error('В странице остались ссылки на файлы из assets/');
  }
  return page;
}
