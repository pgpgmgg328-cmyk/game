import { describe, expect, it } from 'vitest';
import { FLAG_DEFAULTS } from '../src/config/balance';
import { defaultFlagStrings, defaultFlags, parseFlags } from '../src/core/flags';

describe('флаги remote config', () => {
  it('значения по умолчанию — из config/balance.ts, строками для getFlags', () => {
    expect(defaultFlags()).toEqual({
      goldenChance: FLAG_DEFAULTS.goldenChance,
      interstitialCooldownSec: 90,
      spawnWeights: [...FLAG_DEFAULTS.spawnWeights],
      secondChanceEnabled: true,
      dailyRewardCoins: 150,
    });
    expect(defaultFlagStrings()).toEqual({
      goldenChance: '0.02',
      interstitialCooldownSec: '90',
      spawnWeights: '30,28,22,14,6',
      secondChanceEnabled: 'true',
      dailyRewardCoins: '150',
    });
    // Строки по умолчанию разбираются обратно в те же значения.
    expect(parseFlags(defaultFlagStrings())).toEqual(defaultFlags());
  });

  it('разбирает строки из консоли', () => {
    expect(
      parseFlags({
        goldenChance: ' 0,05 ',
        interstitialCooldownSec: '120',
        spawnWeights: '[40, 30, 20, 8, 2]',
        secondChanceEnabled: 'FALSE',
        dailyRewardCoins: ' 250.7 ',
      }),
    ).toEqual({
      goldenChance: 0.05,
      interstitialCooldownSec: 120,
      spawnWeights: [40, 30, 20, 8, 2],
      secondChanceEnabled: false,
      dailyRewardCoins: 250,
    });
    expect(parseFlags({ spawnWeights: '10;10;10;10;0', secondChanceEnabled: '1' })).toMatchObject({
      spawnWeights: [10, 10, 10, 10, 0],
      secondChanceEnabled: true,
    });
  });

  it.each([
    ['goldenChance', 'много'],
    ['goldenChance', '-0.1'],
    ['goldenChance', '0.9'],
    ['goldenChance', 'NaN'],
    ['interstitialCooldownSec', '1e9'],
    ['interstitialCooldownSec', ''],
    ['spawnWeights', '30,28,22'],
    ['spawnWeights', '0,0,0,0,0'],
    ['spawnWeights', '30,28,22,14,-6'],
    ['spawnWeights', '30,28,22,14,6,1'],
    ['spawnWeights', '30,28,x,14,6'],
    ['spawnWeights', '99999,1,1,1,1'],
    ['secondChanceEnabled', 'наверное'],
    ['dailyRewardCoins', '-5'],
    ['dailyRewardCoins', '1000000'],
    ['dailyRewardCoins', 'сто'],
  ])('битый флаг %s = «%s» заменяется значением по умолчанию', (name, value) => {
    expect(parseFlags({ [name]: value })).toEqual(defaultFlags());
  });

  it('пустой набор флагов — все значения по умолчанию', () => {
    expect(parseFlags({})).toEqual(defaultFlags());
  });
});
