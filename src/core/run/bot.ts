/** Клавиша в банке глазами бота: тир, центр по x, верхний край и ширина (единицы физики). */
export interface BotKey {
  tier: number;
  x: number;
  top: number;
  width: number;
}

export interface BotView {
  /** Тир и ширина висящей клавиши. */
  tier: number;
  width: number;
  /** Над банкой «Метеорчик» (мир 3): он убирает клавишу, в которую попадёт. */
  meteor?: boolean;
  /** Внутренняя ширина банки и высота дна. */
  jarWidth: number;
  floorY: number;
  keys: readonly BotKey[];
}

/** Шаг, с которым бот перебирает места для броска. */
const SCAN_STEP = 10;

/** Где куча ниже всего под клавишей шириной width с центром в x (больше y — ниже). */
function surfaceAt(view: BotView, x: number, width: number): number {
  let surface = view.floorY;
  for (const key of view.keys) {
    if (x + width / 2 <= key.x - key.width / 2 || x - width / 2 >= key.x + key.width / 2) continue;
    surface = Math.min(surface, key.top);
  }
  return surface;
}

function clampAim(view: BotView, x: number): number {
  return Math.min(view.jarWidth - view.width / 2, Math.max(view.width / 2, x));
}

/**
 * Куда бросить висящую клавишу (режим ?bot=1 для soak-теста и промо-видео): «внимательный»
 * бот, как в проверке баланса. Есть такая же клавиша сверху кучи — бросает на неё, иначе —
 * в самое низкое место. Доля бросков randomShare — случайные, чтобы игра не была идеальной.
 */
export function chooseAim(view: BotView, random: () => number, randomShare = 0.25): number {
  const min = view.width / 2;
  const max = view.jarWidth - view.width / 2;
  if (random() < randomShare) return clampAim(view, min + random() * (max - min));

  // «Метеорчик» — в самую высокую клавишу: так куча становится ниже.
  if (view.meteor) {
    let highest: BotKey | null = null;
    for (const key of view.keys) if (!highest || key.top < highest.top) highest = key;
    return clampAim(view, highest ? highest.x : (min + max) / 2);
  }

  // Такая же клавиша, до которой можно долететь: её верх — на поверхности кучи.
  let target: BotKey | null = null;
  for (const key of view.keys) {
    if (key.tier !== view.tier) continue;
    if (surfaceAt(view, key.x, Math.min(view.width, key.width)) < key.top - 1) continue;
    if (!target || key.top < target.top) target = key;
  }
  if (target) return clampAim(view, target.x);

  let bestX = (min + max) / 2;
  let bestSurface = Number.NEGATIVE_INFINITY;
  for (let x = min; x <= max; x += SCAN_STEP) {
    const surface = surfaceAt(view, x, view.width);
    if (surface > bestSurface) {
      bestSurface = surface;
      bestX = x;
    }
  }
  return clampAim(view, bestX);
}
