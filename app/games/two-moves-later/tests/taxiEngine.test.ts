import { describe, expect, test } from 'vitest';
import { createState, resolveSwipe } from '../mechanic/engine/taxiEngine.ts';
import type { Direction, Level } from '../mechanic/engine/types.ts';
import { LEVELS } from '../mechanic/levels/loadLevels.ts';
import { LEVEL_ONE_SOLUTION } from './solution.ts';

function direction(from: { row: number; col: number }, to: { row: number; col: number }): Direction {
  if (to.row < from.row) return 'up';
  if (to.row > from.row) return 'down';
  if (to.col < from.col) return 'left';
  return 'right';
}

describe('taxi engine', () => {
  const level = LEVELS[0] as Level;

  test('starts with 22 taxis, three holes and one waiting passenger', () => {
    const state = createState(level);
    expect(state.taxis).toHaveLength(22);
    expect(25 - state.taxis.length).toBe(3);
    expect(state.passengers.filter((passenger) => passenger.status === 'waiting')).toHaveLength(1);
  });

  test('an invalid swipe changes nothing and spends no patience', () => {
    const state = createState(level);
    const outcome = resolveSwipe(level, state, {
      type: 'swipe-taxi',
      taxiId: 'taxi-1',
      direction: 'up',
    });
    expect(outcome.valid).toBe(false);
    expect(outcome.state).toBe(state);
    expect(outcome.state.moves).toBe(0);
    expect(outcome.state.passengers[0]?.patience).toBe(6);
  });

  test('a matching taxi leaves immediately and activates the next passenger', () => {
    const state = createState(level);
    const outcome = resolveSwipe(level, state, {
      type: 'swipe-taxi',
      taxiId: 'taxi-17',
      direction: 'down',
    });
    expect(outcome.valid).toBe(true);
    expect(outcome.state.taxis).toHaveLength(21);
    expect(outcome.state.served).toBe(1);
    expect(outcome.state.passengers.find((passenger) => passenger.id === 'passenger-2')?.status).toBe(
      'waiting',
    );
  });

  test('the authored 29-swipe route clears the complete board', () => {
    let state = createState(level);
    for (const move of LEVEL_ONE_SOLUTION) {
      const taxi = state.taxis.find((candidate) => candidate.id === move.taxiId);
      expect(taxi, `missing ${move.taxiId}`).toBeDefined();
      if (taxi === undefined) break;
      const outcome = resolveSwipe(level, state, {
        type: 'swipe-taxi',
        taxiId: move.taxiId,
        direction: direction(taxi, move),
      });
      expect(outcome.valid, `invalid move for ${move.taxiId}`).toBe(true);
      state = outcome.state;
    }
    expect(state.moves).toBe(29);
    expect(state.served).toBe(22);
    expect(state.taxis).toHaveLength(0);
    expect(state.status).toBe('won');
  });

  test('a waiting passenger at one leaves after an unrelated valid swipe', () => {
    const tinyLevel: Level = {
      id: 1,
      gridSize: 5,
      taxis: [
        { id: 'red', color: 'red', row: 2, col: 2 },
        { id: 'blue', color: 'blue', row: 4, col: 4 },
      ],
      passengers: [
        {
          id: 'passenger',
          color: 'red',
          target: { side: 'top', index: 0 },
          initialPatience: 1,
          unlockAfterServed: 0,
        },
      ],
    };
    const outcome = resolveSwipe(tinyLevel, createState(tinyLevel), {
      type: 'swipe-taxi',
      taxiId: 'blue',
      direction: 'left',
    });
    expect(outcome.state.status).toBe('failed');
    expect(outcome.state.failReason).toBe('passenger_timeout');
  });
});
