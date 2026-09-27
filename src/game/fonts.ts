/** Шрифт интерфейса: Nunito из src/assets/fonts, если не загрузился — системный. */
export const FONT_FAMILY = '"Nunito", "Arial Rounded MT Bold", "Arial", sans-serif';

/**
 * Загружает шрифт до первого текста: Phaser рисует текст на canvas и сам не дожидается шрифта.
 * Через timeoutMs продолжаем без него, чтобы медленная сеть не задерживала игру.
 */
export async function loadFonts(timeoutMs = 5000): Promise<void> {
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts || typeof fonts.load !== 'function') return;
  const sample = 'Сквиши Клавиши Squishy Keys 0123456789';
  const loading = Promise.all([
    fonts.load(`800 48px "Nunito"`, sample),
    fonts.load(`600 48px "Nunito"`, sample),
  ]).then(
    () => undefined,
    () => undefined,
  );
  const timeout = new Promise<void>((resolve) => window.setTimeout(resolve, timeoutMs));
  await Promise.race([loading, timeout]);
}
