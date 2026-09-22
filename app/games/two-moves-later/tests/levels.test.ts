import { describe, expect, test } from 'vitest';
import { GAME } from '../game.config.ts';
import { LEVELS, parseLevelPack } from '../mechanic/levels/loadLevels.ts';

describe('level pack', () => {
  test('contains exactly the one-level slice', () => {
    expect(GAME.levelCount).toBe(1);
    expect(LEVELS).toHaveLength(1);
  });

  test('keeps colors balanced and grows concurrency 1 to 2 to 3', () => {
    const level = LEVELS[0];
    expect(level).toBeDefined();
    if (level === undefined) return;
    for (const color of ['red', 'blue', 'yellow'] as const) {
      expect(level.taxis.filter((taxi) => taxi.color === color)).toHaveLength(
        level.passengers.filter((passenger) => passenger.color === color).length,
      );
    }
    expect(level.passengers.filter((passenger) => passenger.unlockAfterServed === 0)).toHaveLength(1);
    expect(level.passengers.filter((passenger) => passenger.unlockAfterServed === 4)).toHaveLength(2);
    expect(level.passengers.filter((passenger) => passenger.unlockAfterServed === 12)).toHaveLength(3);
  });

  test('rejects a pack with the wrong number of levels', () => {
    expect(() => parseLevelPack({ schemaVersion: 1, levels: [] }, 1)).toThrow(
      'must contain 1 level',
    );
  });
});
