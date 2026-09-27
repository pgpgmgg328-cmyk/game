import { defineConfig } from 'vite';

export default defineConfig({
  // Игра открывается с хостинга Яндекса из подпапки: все пути к ассетам должны быть относительными.
  base: './',
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
