import { describe, expect, it } from 'vitest';
import { chooseAim, type BotView } from '../src/core/run/bot';

const never = (): number => 0.99;

function view(keys: BotView['keys'], tier = 2, width = 60): BotView {
  return { tier, width, jarWidth: 600, floorY: 800, keys };
}

describe('бот для soak-теста', () => {
  it('бросает на такую же клавишу сверху кучи', () => {
    const keys = [
      { tier: 3, x: 100, top: 700, width: 72 },
      { tier: 2, x: 420, top: 720, width: 60 },
    ];
    expect(chooseAim(view(keys), never)).toBe(420);
  });

  it('засыпанную такую же клавишу не выбирает, бросает в самое низкое место', () => {
    const keys = [
      { tier: 2, x: 300, top: 740, width: 60 },
      { tier: 5, x: 300, top: 640, width: 100 },
      { tier: 4, x: 100, top: 700, width: 85 },
    ];
    const aim = chooseAim(view(keys), never);
    expect(aim).not.toBe(300);
    // Под выбранным местом клавиш нет: клавиша упадёт на дно.
    for (const key of keys) {
      expect(Math.abs(aim - key.x)).toBeGreaterThanOrEqual((key.width + 60) / 2);
    }
  });

  it('случайный бросок не выходит за стенки банки', () => {
    const always = (): number => 0;
    expect(chooseAim(view([], 5, 100), always)).toBe(50);
    let i = 0;
    const sequence = [0.1, 0.999];
    const random = (): number => sequence[i++ % 2]!;
    expect(chooseAim(view([], 5, 100), random)).toBeLessThanOrEqual(550);
  });
});
