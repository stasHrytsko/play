import { describe, expect, test } from 'vitest';
import { GAME } from '../game.config.ts';
import { LEVELS, parseLevelPack } from '../mechanic/levels/loadLevels.ts';
import { casualWinRate } from './bot.ts';
import { SOLUTIONS } from './solution.ts';
import { replay, solveLevel } from './solver.ts';

describe('level pack', () => {
  test('ships four levels, 3 → 4 → 5 → 7 passengers', () => {
    expect(GAME.levelCount).toBe(4);
    expect(LEVELS.map((level) => level.passengers.length)).toEqual([3, 4, 5, 7]);
  });

  test.each(LEVELS.map((level, index) => [index + 1, level] as const))(
    'level %i: the recorded route wins through the real engine',
    (id, level) => {
      const moves = SOLUTIONS[id - 1];
      expect(moves).toBeDefined();
      const { final } = replay(level, moves ?? []);
      expect(final.status).toBe('won');
    },
  );

  test.each(LEVELS.slice(1).map((level, index) => [index + 2, level] as const))(
    'level %i cannot be won by moving only the colours passengers want',
    (_id, level) => {
      const direct = solveLevel(level, { targetColorsOnly: true, branches: Number.POSITIVE_INFINITY });
      expect(direct.complete).toBe(true);
      expect(direct.solution).toBeNull();
    },
  );

  test('a casual player wins the early levels far more often than the late ones', () => {
    const rates = LEVELS.map((level) => casualWinRate(level, 60));
    expect(rates[0]).toBeGreaterThan(rates[3] ?? 1);
    expect(rates[0]).toBeGreaterThanOrEqual(0.8);
    expect(rates[3]).toBeLessThanOrEqual(0.4);
  }, 60_000);

  test('rejects a pack with the wrong number of levels', () => {
    expect(() => parseLevelPack({ schemaVersion: 1, levels: [] }, 4)).toThrow('must contain 4 level');
  });
});
