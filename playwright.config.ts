import { defineConfig, devices } from '@playwright/test';

/**
 * `npm run e2e` собирает игру и проверяет прод-сборку через `vite preview`.
 * Скриншоты сохраняются в e2e/__screens__ (CLAUDE.md, «Когда фича считается готовой»).
 */
export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:4173',
    // Без видеокарты Chromium рисует WebGL программно и иначе ругается в консоль об этом.
    launchOptions: { args: ['--enable-unsafe-swiftshader'] },
    // Игра отключает пульсацию кнопок при «уменьшить движение» — скриншоты получаются одинаковыми.
    contextOptions: { reducedMotion: 'reduce' },
  },
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
