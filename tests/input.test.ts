import { describe, expect, it } from 'vitest';
import { actionForKey } from '../src/core/input';

const key = (
  code: string,
  modifiers: Partial<Record<'ctrlKey' | 'altKey' | 'metaKey', boolean>> = {},
) => ({
  code,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  ...modifiers,
});

describe('actionForKey', () => {
  it.each([
    ['ArrowLeft', 'left'],
    ['KeyA', 'left'],
    ['ArrowRight', 'right'],
    ['KeyD', 'right'],
    ['Space', 'drop'],
    ['Enter', 'drop'],
    ['NumpadEnter', 'drop'],
  ])('%s → %s', (code, action) => {
    expect(actionForKey(key(code))).toBe(action);
  });

  it('не зависит от раскладки: работает по физической клавише', () => {
    // На русской раскладке клавиша A печатает «ф», но event.code у неё всё равно KeyA.
    expect(actionForKey(key('KeyA'))).toBe('left');
  });

  it('игнорирует остальные клавиши', () => {
    expect(actionForKey(key('KeyW'))).toBeNull();
    expect(actionForKey(key('Escape'))).toBeNull();
    expect(actionForKey(key('Tab'))).toBeNull();
  });

  it('не перехватывает системные сочетания', () => {
    expect(actionForKey(key('KeyA', { ctrlKey: true }))).toBeNull();
    expect(actionForKey(key('KeyD', { metaKey: true }))).toBeNull();
    expect(actionForKey(key('Enter', { altKey: true }))).toBeNull();
  });
});
