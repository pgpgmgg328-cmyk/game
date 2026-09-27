import { computeLayout, type Layout } from '../core/layout';

function sameLayout(a: Layout, b: Layout): boolean {
  return (
    a.dpr === b.dpr &&
    a.canvasWidth === b.canvasWidth &&
    a.canvasHeight === b.canvasHeight &&
    a.column.x === b.column.x &&
    a.column.y === b.column.y &&
    a.column.width === b.column.width &&
    a.column.height === b.column.height
  );
}

/**
 * Следит за размером области игры. Ресайз и поворот экрана обрабатываются без перезапуска:
 * слушатели получают новый Layout, а сцены просто перекладывают элементы.
 */
export class Viewport {
  private readonly container: HTMLElement;
  private readonly listeners = new Set<(layout: Layout) => void>();
  private desktop: boolean;
  private layout: Layout;
  private frame = 0;

  constructor(container: HTMLElement, desktop: boolean) {
    this.container = container;
    this.desktop = desktop;
    this.layout = this.measure();
  }

  /** Пока площадка не сообщила тип устройства, считаем десктопом всё, чем управляют мышью. */
  static guessDesktop(): boolean {
    return !(
      typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
    );
  }

  get current(): Layout {
    return this.layout;
  }

  onChange(listener: (layout: Layout) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setDesktop(desktop: boolean): void {
    if (desktop === this.desktop) return;
    this.desktop = desktop;
    this.update();
  }

  start(): void {
    window.addEventListener('resize', this.schedule);
    window.addEventListener('orientationchange', this.onOrientationChange);
    window.visualViewport?.addEventListener('resize', this.schedule);
  }

  /** Пересчитать раскладку сейчас. */
  update(): void {
    const next = this.measure();
    if (sameLayout(next, this.layout)) return;
    this.layout = next;
    this.listeners.forEach((listener) => listener(next));
  }

  private readonly schedule = (): void => {
    if (this.frame !== 0) return;
    this.frame = window.requestAnimationFrame(() => {
      this.frame = 0;
      this.update();
    });
  };

  // iOS сообщает новый размер не сразу после поворота, поэтому проверяем ещё раз чуть позже.
  private readonly onOrientationChange = (): void => {
    this.schedule();
    window.setTimeout(this.schedule, 300);
  };

  private measure(): Layout {
    const rect = this.container.getBoundingClientRect();
    return computeLayout({
      cssWidth: rect.width || window.innerWidth,
      cssHeight: rect.height || window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
      isDesktop: this.desktop,
    });
  }
}
