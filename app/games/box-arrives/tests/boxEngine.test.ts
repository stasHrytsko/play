import { describe, expect, it } from 'vitest';
import { createState, isComplete, resolveTap } from '../mechanic/engine/boxEngine.ts';
import type { Level, LevelState } from '../mechanic/engine/types.ts';

/**
 * Rules under test are numbered in specs/01-box-arrives.md §3; edge cases come
 * from §11. Each test names the rule it pins down — a test that cannot name
 * one is testing the implementation instead of the game.
 */

function level(overrides: Partial<Level> = {}): Level {
  return {
    id: 1,
    shiftEvery: 3,
    pocketSize: 3,
    queuePreview: 3,
    screws: [
      { id: 'a', color: 'c1', x: 0.2, y: 0.2 },
      { id: 'b', color: 'c2', x: 0.4, y: 0.2 },
      { id: 'c', color: 'c3', x: 0.6, y: 0.2 },
      { id: 'd', color: 'c3', x: 0.8, y: 0.2 },
      { id: 'e', color: 'c3', x: 0.2, y: 0.5 },
      { id: 'f', color: 'c3', x: 0.4, y: 0.5 },
    ],
    boxes: ['c1', 'c2', 'c3', 'c1', 'c2', 'c3'],
    ...overrides,
  };
}

function tap(lv: Level, state: LevelState, id: string): LevelState {
  return resolveTap(lv, state, { type: 'tap', targetId: id }).state;
}

describe('box-arrives engine', () => {
  it('§3.1–3.2: starts with two active boxes, a full shift counter and an empty pocket', () => {
    const lv = level();
    const state = createState(lv);

    expect(state.activeBoxes).toEqual(['c1', 'c2']);
    expect(state.boxQueue).toEqual(['c3', 'c1', 'c2', 'c3']);
    expect(state.movesUntilShift).toBe(3);
    expect(state.pocket).toEqual([]);
    expect(state.remainingScrews).toHaveLength(6);
    expect(state.status).toBe('playing');
  });

  it('§3.5: a screw matching an active box leaves the plate without touching the pocket', () => {
    const lv = level();
    const outcome = resolveTap(lv, createState(lv), { type: 'tap', targetId: 'a' });

    expect(outcome.matched).toBe(true);
    expect(outcome.matchedBoxIndex).toBe(0);
    expect(outcome.pocketed).toBe(false);
    expect(outcome.state.pocket).toEqual([]);
    expect(outcome.state.remainingScrews).not.toContain('a');
  });

  it('§3.6: a screw with no active box goes into the pocket', () => {
    const lv = level();
    const outcome = resolveTap(lv, createState(lv), { type: 'tap', targetId: 'c' });

    expect(outcome.matched).toBe(false);
    expect(outcome.pocketed).toBe(true);
    expect(outcome.state.pocket).toEqual([{ screwId: 'c', color: 'c3' }]);
  });

  it('§3.7: the fourth unmatched screw loses the level with pocket_overflow', () => {
    const lv = level();
    let state = createState(lv);
    for (const id of ['c', 'd', 'e']) state = tap(lv, state, id);

    // Three unmatched screws fit; the pocket is now full. The shift has not
    // happened yet because only three moves were made — the third one shifts.
    expect(state.pocket).toHaveLength(0);
    expect(state.activeBoxes).toEqual(['c2', 'c3']);

    // With c3 active, keep going until the pocket is genuinely full again.
    const tight = level({
      screws: [
        { id: 'p1', color: 'c4', x: 0.1, y: 0.1 },
        { id: 'p2', color: 'c4', x: 0.2, y: 0.1 },
        { id: 'p3', color: 'c4', x: 0.3, y: 0.1 },
        { id: 'p4', color: 'c4', x: 0.4, y: 0.1 },
      ],
      boxes: ['c1', 'c2', 'c4', 'c4', 'c4'],
    });
    let s = createState(tight);
    for (const id of ['p1', 'p2']) s = tap(tight, s, id);
    expect(s.pocket).toHaveLength(2);

    const third = resolveTap(tight, s, { type: 'tap', targetId: 'p3' });
    // The third move also triggers the shift, which brings c4 and flushes.
    expect(third.state.status).toBe('playing');

    // Rebuild a state where the pocket is full and no shift is due.
    const full: LevelState = { ...s, pocket: [
      { screwId: 'x1', color: 'c4' },
      { screwId: 'x2', color: 'c4' },
      { screwId: 'x3', color: 'c4' },
    ], movesUntilShift: 3 };
    const dead = resolveTap(tight, full, { type: 'tap', targetId: 'p3' });

    expect(dead.state.status).toBe('failed');
    expect(dead.state.failReason).toBe('pocket_overflow');
    expect(dead.state.remainingScrews).not.toContain('p3');
  });

  it('§3.8–3.9: every third move shifts the boxes and resets the counter', () => {
    const lv = level();
    let state = createState(lv);

    state = tap(lv, state, 'a');
    expect(state.movesUntilShift).toBe(2);
    state = tap(lv, state, 'b');
    expect(state.movesUntilShift).toBe(1);

    const third = resolveTap(lv, state, { type: 'tap', targetId: 'c' });
    expect(third.shifted).toBe(true);
    expect(third.state.activeBoxes).toEqual(['c2', 'c3']);
    expect(third.state.boxQueue).toEqual(['c1', 'c2', 'c3']);
    expect(third.state.movesUntilShift).toBe(3);
  });

  it('§3.10: the shift flushes every pocketed screw the new pair accepts, without costing a move', () => {
    const lv = level();
    let state = createState(lv);

    state = tap(lv, state, 'c'); // c3 → pocket
    state = tap(lv, state, 'd'); // c3 → pocket
    expect(state.pocket).toHaveLength(2);

    const third = resolveTap(lv, state, { type: 'tap', targetId: 'e' });
    // The third tap pockets e as well, then the shift brings c3 and all three go.
    expect(third.shifted).toBe(true);
    expect(third.flushed.map((slot) => slot.screwId)).toEqual(['c', 'd', 'e']);
    expect(third.state.pocket).toEqual([]);
    expect(third.state.moves).toBe(3);
  });

  it('§3.12 / §2: the win is the empty plate, and a screw parked in the pocket does not withhold it', () => {
    const lv = level({
      screws: [
        { id: 'only', color: 'c1', x: 0.5, y: 0.5 },
        { id: 'stuck', color: 'c3', x: 0.5, y: 0.7 },
      ],
      boxes: ['c1', 'c2', 'c1', 'c2'],
    });
    let state = createState(lv);
    state = tap(lv, state, 'stuck'); // no c3 box in reach — pocketed
    expect(state.pocket).toHaveLength(1);

    state = tap(lv, state, 'only');
    expect(state.status).toBe('won');
    expect(isComplete(state)).toBe(true);
    expect(state.pocket).toHaveLength(1);
  });

  it('§11: tapping the same screw twice does nothing the second time', () => {
    const lv = level();
    const first = resolveTap(lv, createState(lv), { type: 'tap', targetId: 'a' });
    const second = resolveTap(lv, first.state, { type: 'tap', targetId: 'a' });

    expect(second.ignored).toBe(true);
    expect(second.state).toBe(first.state);
    expect(second.state.moves).toBe(1);
  });

  it('§11: tapping something that is not a screw is not a move', () => {
    const lv = level();
    const state = createState(lv);
    const outcome = resolveTap(lv, state, { type: 'tap', targetId: 'hud' });

    expect(outcome.ignored).toBe(true);
    expect(outcome.state.moves).toBe(0);
  });

  it('§11: a finished level ignores further taps', () => {
    const lv = level({
      screws: [{ id: 'only', color: 'c1', x: 0.5, y: 0.5 }],
      boxes: ['c1', 'c2', 'c1'],
    });
    const won = tap(lv, createState(lv), 'only');
    expect(won.status).toBe('won');

    const after = resolveTap(lv, won, { type: 'tap', targetId: 'only' });
    expect(after.ignored).toBe(true);
  });

  it('is pure: resolving a tap does not mutate the state it was given', () => {
    const lv = level();
    const before = createState(lv);
    const snapshot = JSON.stringify(before);

    resolveTap(lv, before, { type: 'tap', targetId: 'c' });

    expect(JSON.stringify(before)).toBe(snapshot);
  });
});
