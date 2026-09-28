/** Параметры адреса для автотестов. Действуют только вместе с ?e2e: игрок их не увидит. */
export function e2eParams(): URLSearchParams | null {
  const params = new URLSearchParams(window.location.search);
  return params.has('e2e') ? params : null;
}

/** seed забега для воспроизводимых автотестов (?e2e&seed=123). */
export function e2eSeed(): number | undefined {
  const value = e2eParams()?.get('seed');
  if (value === null || value === undefined) return undefined;
  const seed = Number(value);
  return Number.isSafeInteger(seed) && seed >= 0 ? seed >>> 0 : undefined;
}
