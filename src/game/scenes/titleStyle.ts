import type Phaser from 'phaser';
import { COLORS } from '../ui/theme';

/** Крупный заголовок экрана. */
export function titleStyle(fontSize: number): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontSize: `${fontSize}px`,
    fontStyle: '900',
    color: COLORS.title,
    stroke: COLORS.titleStroke,
    strokeThickness: Math.round(fontSize / 5),
    align: 'center',
  };
}
