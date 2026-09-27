import { defineConfig, type Connect, type Plugin } from 'vite';

/**
 * Локально SDK Яндекса нет: отдаём пустой /sdk.js, чтобы в консоли не было ошибки 404.
 * Работает только в `vite` и `vite preview`, в сборку файл не попадает.
 * При `npm run dev:ya` настоящий /sdk.js отдаёт прокси Яндекса раньше, чем запрос дойдёт сюда.
 */
function localSdkStub(): Plugin {
  const serveStub: Connect.NextHandleFunction = (req, res, next) => {
    if (req.url?.split('?')[0] !== '/sdk.js') {
      next();
      return;
    }
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end('/* Локальный запуск без SDK Яндекс Игр: игра работает через LocalPlatform. */\n');
  };
  return {
    name: 'local-sdk-stub',
    configureServer(server) {
      server.middlewares.use(serveStub);
    },
    configurePreviewServer(server) {
      server.middlewares.use(serveStub);
    },
  };
}

export default defineConfig({
  // Игра открывается с хостинга Яндекса из подпапки: все пути к ассетам должны быть относительными.
  base: './',
  plugins: [localSdkStub()],
  build: {
    // Требования Яндекса (п. 1.20) перечисляют старые устройства. Собираем под iOS 12+ и Chrome 61+,
    // а не под браузеры 2023 года (цель Vite по умолчанию).
    target: ['chrome61', 'edge79', 'firefox60', 'safari12', 'ios12'],
    // Phaser — один большой модуль (~1,2 МБ), предупреждение о размере чанка здесь бесполезно.
    chunkSizeWarningLimit: 2000,
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
