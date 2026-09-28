/** Цвет в виде {r, g, b} 0…255. */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return { r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff };
}

export function rgbToNumber({ r, g, b }: Rgb): number {
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

export function hexToNumber(hex: string): number {
  return rgbToNumber(hexToRgb(hex));
}

function mix(a: Rgb, b: Rgb, amount: number): Rgb {
  return {
    r: a.r + (b.r - a.r) * amount,
    g: a.g + (b.g - a.g) * amount,
    b: a.b + (b.b - a.b) * amount,
  };
}

/** Светлее: amount 0…1 — доля белого. */
export function lighten(hex: string, amount: number): Rgb {
  return mix(hexToRgb(hex), { r: 255, g: 255, b: 255 }, amount);
}

/**
 * Темнее: к цвету подмешивается тёмно-сливовый, а не чёрный — так тени и обводки
 * остаются мягкими и «пастельными».
 */
export function darken(hex: string, amount: number): Rgb {
  return mix(hexToRgb(hex), { r: 58, g: 40, b: 96 }, amount);
}

export function css({ r, g, b }: Rgb, alpha = 1): string {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
}
