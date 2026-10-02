import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/**
 * `npm run soak` — бот играет 10 минут подряд (SOAK_MINUTES — другое число минут).
 * Проверяется, что в консоли нет ошибок, игра не застревает и память не растёт.
 */
export default defineConfig({
  ...base,
  testDir: 'e2e/soak',
  testMatch: '**/*.soak.ts',
  fullyParallel: false,
  workers: 1,
  timeout: (Number(process.env.SOAK_MINUTES ?? 10) + 5) * 60_000,
});
