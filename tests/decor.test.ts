import { describe, expect, it } from 'vitest';
import { activeDecor, ownsDecor, selectDecor, type DecorItem } from '../src/core/meta/decor';
import { createDefaultSave, type Save } from '../src/core/save/schema';

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
