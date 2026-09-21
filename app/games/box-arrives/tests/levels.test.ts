import { describe, expect, it } from 'vitest';
import { GAME } from '../game.config.ts';
import { createState, resolveTap } from '../mechanic/engine/boxEngine.ts';
import type { Level, LevelState } from '../mechanic/engine/types.ts';
import { LEVELS, parseLevelPack } from '../mechanic/levels/loadLevels.ts';
import rawLevelPack from '../mechanic/levels/levels.json';
import { WINNING_LINES } from './lines.ts';

/**
 * The level pack is authored content, and `solver: none` in the spec means no
 * solver ships with the game. These tests are what replaces it: a recorded
 * winning line proves each level is beatable, and two dumb strategies prove
 * the levels are not beatable without thinking.
 *
 * The second half is the kill criterion applied to content (§1, §6). If a
 * player who never reads the queue preview can clear level 5, the preview is
 * decoration and the concept is dead — so that must fail here, before release.
 *
 * The winning lines live in ./lines.ts because the E2E suite taps the same
 * ones on a real canvas — one recording, two readers.
 */

type Pick = (
  left: readonly string[],
  byId: ReadonlyMap<string, { color: string }>,
  state: LevelState,
) => string | undefined;

function play(level: Level, pick: Pick): { won: boolean; peakPocket: number } {
  const byId = new Map(level.screws.map((screw) => [screw.id, screw]));
  let state = createState(level);
  let peakPocket = 0;

  while (state.status === 'playing') {
    const id = pick(state.remainingScrews, byId, state);
    if (id === undefined) break;
    state = resolveTap(level, state, { type: 'tap', targetId: id }).state;
    peakPocket = Math.max(peakPocket, state.pocket.length);
  }

  return { won: state.status === 'won', peakPocket };
}

/** Tap them in the order they appear in the file — what happens without a plan. */
const naive: Pick = (left) => left[0];

/**
 * Take anything that fits a box right now, otherwise pocket whatever is first.
 * Plays well, never looks at the queue. This is the strategy the kill
 * criterion is written against.
 */
const greedyBlind: Pick = (left, byId, state) =>
  left.find((id) => {
    const color = byId.get(id)?.color;
    return color !== undefined && (state.activeBoxes[0] === color || state.activeBoxes[1] === color);
  }) ?? left[0];

function lineFor(level: Level): Pick {
  const line = WINNING_LINES[level.id] ?? [];
  return (left) => line.find((id) => left.includes(id));
}

describe('box-arrives level pack', () => {
  it('has exactly the number of levels the game declares', () => {
    expect(LEVELS).toHaveLength(GAME.levelCount);
    expect(LEVELS.map((level) => level.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it('follows the curve of spec §6: colours and screws grow level to level', () => {
    const counts = LEVELS.map((level) => ({
      screws: level.screws.length,
      colors: new Set(level.screws.map((screw) => screw.color)).size,
    }));

    expect(counts.map((entry) => entry.screws)).toEqual([10, 13, 16, 20, 24]);
    expect(counts.map((entry) => entry.colors)).toEqual([3, 3, 4, 4, 5]);
  });

  it('gives every level enough boxes for every shift its screws can trigger', () => {
    for (const level of LEVELS) {
      const needed = 2 + Math.ceil(level.screws.length / level.shiftEvery);
      expect(level.boxes.length).toBeGreaterThanOrEqual(needed);
    }
  });

  it('is beatable: the recorded line clears every level', () => {
    for (const level of LEVELS) {
      expect(play(level, lineFor(level)).won, `level ${String(level.id)}`).toBe(true);
    }
  });

  it('uses the pocket on the winning line, and never fills it', () => {
    // A pocket that perfect play never touches is a decorative loss condition.
    for (const level of LEVELS) {
      const { peakPocket } = play(level, lineFor(level));
      expect(peakPocket, `level ${String(level.id)} peak`).toBeGreaterThan(0);
      expect(peakPocket, `level ${String(level.id)} peak`).toBeLessThan(level.pocketSize);
    }
  });

  it('forgives thoughtless play on levels 1–2 and punishes it from level 3', () => {
    const wins = LEVELS.map((level) => play(level, naive).won);
    expect(wins).toEqual([true, true, false, false, false]);
  });

  it('kill criterion: ignoring the queue preview does not clear levels 3–5', () => {
    // §1 — if this ever goes green for level 5, the twist stopped mattering
    // and the concept is buried rather than rebalanced.
    const wins = LEVELS.map((level) => play(level, greedyBlind).won);
    expect(wins.slice(2)).toEqual([false, false, false]);
  });
});

describe('box-arrives level loader', () => {
  it('accepts the shipped pack', () => {
    expect(() => parseLevelPack(rawLevelPack, GAME.levelCount)).not.toThrow();
  });

  it('rejects a pack whose queue cannot survive every shift', () => {
    const pack = structuredClone(rawLevelPack) as { levels: { boxes: string[] }[] };
    pack.levels[0]!.boxes = ['c1', 'c2'];

    expect(() => parseLevelPack(pack, GAME.levelCount)).toThrow(/need at least/);
  });

  it('rejects a screw whose colour never arrives as a box', () => {
    const pack = structuredClone(rawLevelPack) as {
      levels: { screws: { color: string }[] }[];
    };
    pack.levels[0]!.screws[0]!.color = 'c9';

    expect(() => parseLevelPack(pack, GAME.levelCount)).toThrow(/never arrives as a box/);
  });

  it('rejects coordinates outside the plate', () => {
    const pack = structuredClone(rawLevelPack) as { levels: { screws: { x: number }[] }[] };
    pack.levels[0]!.screws[0]!.x = 1.4;

    expect(() => parseLevelPack(pack, GAME.levelCount)).toThrow(/must be a number in \[0, 1\]/);
  });
});
