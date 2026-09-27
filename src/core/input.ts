/** Действия игрока с клавиатуры (CLAUDE.md: ←/→ или A/D — двигать, Space/Enter — сбросить). */
export type KeyAction = 'left' | 'right' | 'drop';

export interface KeyInfo {
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

/**
 * Клавиши определяются по event.code — физическому положению клавиши, поэтому раскладка
 * не важна (п. 1.6.2.4): на русской раскладке A/D — это те же клавиши, что Ф/В.
 */
const ACTIONS: Readonly<Record<string, KeyAction>> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  Space: 'drop',
  Enter: 'drop',
  NumpadEnter: 'drop',
};

/** Действие для нажатой клавиши или null. Сочетания с Ctrl, Alt и Cmd не трогаем: они системные. */
export function actionForKey(key: KeyInfo): KeyAction | null {
  if (key.ctrlKey || key.altKey || key.metaKey) return null;
  return ACTIONS[key.code] ?? null;
}
