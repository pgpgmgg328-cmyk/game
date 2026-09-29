import type { DeepReadonly, Save, WorldAlbum } from '../save/schema';

type Album = DeepReadonly<Record<string, WorldAlbum>>;

/** Мир в альбоме: id и сколько в нём форм. */
export interface AlbumWorld {
  id: string;
  forms: number;
}

function entry(album: Album, world: string): DeepReadonly<WorldAlbum> {
  return album[world] ?? { forms: [], golden: [] };
}

export function isDiscovered(album: Album, world: string, tier: number, golden: boolean): boolean {
  const found = entry(album, world);
  return (golden ? found.golden : found.forms).includes(tier);
}

/**
 * Отмечает форму открытой (изменяет черновик). Золотая форма открывает и обычную.
 * Возвращает, какие версии открылись впервые.
 */
export function discoverForm(
  draft: Save,
  world: string,
  tier: number,
  golden: boolean,
): { form: boolean; golden: boolean } {
  const found = draft.album[world] ?? { forms: [], golden: [] };
  draft.album[world] = found;
  const add = (list: number[]): boolean => {
    if (list.includes(tier)) return false;
    list.push(tier);
    list.sort((a, b) => a - b);
    return true;
  };
  const form = add(found.forms);
  return { form, golden: golden ? add(found.golden) : false };
}

/** Процент коллекции: обычные и золотые формы всех миров (диздок, раздел 6). */
export function albumProgress(
  album: Album,
  worlds: readonly AlbumWorld[],
): { found: number; total: number; percent: number } {
  let found = 0;
  let total = 0;
  for (const world of worlds) {
    const opened = entry(album, world.id);
    const inWorld = (tier: number): boolean => tier >= 1 && tier <= world.forms;
    found += opened.forms.filter(inWorld).length + opened.golden.filter(inWorld).length;
    total += world.forms * 2;
  }
  return { found, total, percent: total === 0 ? 0 : Math.floor((found / total) * 100) };
}
