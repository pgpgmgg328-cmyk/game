/**
 * Отключает поведение браузера, которое мешает игре: контекстное меню и выделение по долгому тапу
 * (п. 1.6.1.8, 1.6.2.7), перетаскивание и масштабирование жестом в iOS Safari.
 * Прокрутку и pull-to-refresh отключает CSS (src/style.css).
 */
export function installBrowserGuards(): void {
  const prevent = (event: Event): void => event.preventDefault();
  document.addEventListener('contextmenu', prevent);
  document.addEventListener('selectstart', prevent);
  document.addEventListener('dragstart', prevent);
  // Нестандартное событие iOS Safari: щипок для масштабирования страницы.
  document.addEventListener('gesturestart', prevent);
}
