import { describe, expect, it } from 'vitest';
import { activeDecor, ownsDecor, selectDecor, type DecorItem } from '../src/core/meta/decor';
import { createDefaultSave, type Save } from '../src/core/save/schema';
import { productById } from '../src/core/shop/purchases';
import { BACKGROUNDS as BACKGROUNDS_DATA, JAR_SKINS } from '../src/themes/decor';
import catalog from '../purchases-catalog.json';

const JARS: DecorItem[] = [
  { id: 'glass', kind: 'jar', source: 'default' },
  { id: 'rainbow', kind: 'jar', source: 'streak' },
  { id: 'candy', kind: 'jar', source: 'pack' },
];
const BACKGROUNDS: DecorItem[] = [
  { id: 'world', kind: 'background', source: 'default' },
  { id: 'clouds', kind: 'background', source: 'pack' },
];

function save(change: (draft: Save) => void = () => {}): Save {
  const draft = createDefaultSave();
  change(draft);
  return draft;
}

describe('украшения', () => {
  it('обычные есть у всех, набор — после покупки, «Радуга» — за неделю заданий', () => {
    const fresh = save();
    expect(JARS.map((item) => ownsDecor(fresh, item))).toEqual([true, false, false]);
    const rich = save((d) => {
      d.purchases.skinsPack = true;
      d.daily.bestStreak = 7;
    });
    expect(JARS.map((item) => ownsDecor(rich, item))).toEqual([true, true, true]);
  });

  it('выбрать можно только своё', () => {
    const draft = save();
    expect(selectDecor(draft, JARS[2]!)).toBe(false);
    expect(draft.decor.jar).toBe('glass');
    draft.purchases.skinsPack = true;
    expect(selectDecor(draft, JARS[2]!)).toBe(true);
    expect(selectDecor(draft, BACKGROUNDS[1]!)).toBe(true);
    expect(draft.decor).toEqual({ jar: 'candy', background: 'clouds' });
  });

  it('видно выбранное своё, а пропавшее или неизвестное — заменяется обычным', () => {
    const owner = save((d) => {
      d.purchases.skinsPack = true;
      d.decor = { jar: 'candy', background: 'clouds' };
    });
    expect(activeDecor(owner, JARS).id).toBe('candy');
    expect(activeDecor(owner, BACKGROUNDS).id).toBe('clouds');
    // Покупка пропала (например, другой аккаунт) — обычная банка и фон мира.
    const lost = save((d) => (d.decor = { jar: 'candy', background: 'clouds' }));
    expect(activeDecor(lost, JARS).id).toBe('glass');
    expect(activeDecor(lost, BACKGROUNDS).id).toBe('world');
    const unknown = save((d) => (d.decor.jar = 'future-jar'));
    expect(activeDecor(unknown, JARS).id).toBe('glass');
  });
});

describe('данные украшений (themes/decor.ts)', () => {
  const kinds = [
    { kind: 'jar', items: JAR_SKINS, packCount: productById('skins_pack')!.grants.jarSkins },
    {
      kind: 'background',
      items: BACKGROUNDS_DATA,
      packCount: productById('skins_pack')!.grants.backgrounds,
    },
  ] as const;

  it.each(kinds)(
    '$kind: одно обычное украшение, id без повторов, имена на ru и en',
    ({ kind, items }) => {
      expect(items.filter((item) => item.source === 'default')).toHaveLength(1);
      expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
      for (const item of items) {
        expect(item.kind).toBe(kind);
        expect(item.id).toMatch(/^[a-z0-9-]+$/);
        expect(item.name.ru.trim()).not.toBe('');
        expect(item.name.en.trim()).not.toBe('');
        // У обычного своего вида нет — оно в цветах мира.
        expect(item.look === null).toBe(item.source === 'default');
      }
    },
  );

  it.each(kinds)(
    '$kind: в наборе ровно столько, сколько обещает покупка',
    ({ items, packCount }) => {
      expect(items.filter((item) => item.source === 'pack')).toHaveLength(packCount!);
    },
  );

  it('обычные — те же, что в новом сохранении; «Радуга» — за серию', () => {
    const fresh = createDefaultSave();
    expect(JAR_SKINS.find((item) => item.source === 'default')!.id).toBe(fresh.decor.jar);
    expect(BACKGROUNDS_DATA.find((item) => item.source === 'default')!.id).toBe(
      fresh.decor.background,
    );
    expect(JAR_SKINS.filter((item) => item.source === 'streak').map((item) => item.id)).toEqual([
      'rainbow',
    ]);
  });

  it('описание товара в каталоге перечисляет все украшения набора', () => {
    const description = (catalog as { id: string; description: string }[]).find(
      (item) => item.id === 'skins_pack',
    )!.description;
    for (const item of [...JAR_SKINS, ...BACKGROUNDS_DATA]) {
      if (item.source === 'pack') expect(description).toContain(item.name.ru);
    }
  });
});
