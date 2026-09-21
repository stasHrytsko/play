import { createState, resolveTap } from '../mechanic/engine/boxEngine.ts';
import type { Level, LevelState } from '../mechanic/engine/types.ts';

/**
 * Recorded lines through the shipped level pack, shared by the unit tests and
 * the E2E suite.
 *
 * `solver: none` in the spec means no solver ships with the game, so a
 * winning line cannot be computed at test time — it is content, produced when
 * the pack was designed, and it lives in one place for the same reason every
 * other value does (../../../CLAUDE.md, rule 2). The losing line is the
 * opposite: it is derived, because "what happens to a player without a plan"
 * has to follow the level pack rather than be pinned to it.
 */
export const WINNING_LINES: Readonly<Record<number, readonly string[]>> = {
  1: ['l1s4', 'l1s3', 'l1s6', 'l1s1', 'l1s2', 'l1s9', 'l1s5', 'l1s10', 'l1s7', 'l1s8'],
  2: ['l2s9', 'l2s6', 'l2s2', 'l2s4', 'l2s5', 'l2s8', 'l2s1', 'l2s3', 'l2s12', 'l2s7', 'l2s11', 'l2s13', 'l2s10'],
  3: ['l3s6', 'l3s5', 'l3s1', 'l3s9', 'l3s4', 'l3s7', 'l3s15', 'l3s16', 'l3s13', 'l3s11', 'l3s10', 'l3s14', 'l3s2', 'l3s3', 'l3s8', 'l3s12'],
  4: ['l4s17', 'l4s20', 'l4s9', 'l4s1', 'l4s6', 'l4s10', 'l4s15', 'l4s2', 'l4s4', 'l4s16', 'l4s3', 'l4s19', 'l4s18', 'l4s11', 'l4s7', 'l4s8', 'l4s13', 'l4s12', 'l4s14', 'l4s5'],
  5: ['l5s24', 'l5s1', 'l5s16', 'l5s3', 'l5s20', 'l5s2', 'l5s18', 'l5s5', 'l5s21', 'l5s10', 'l5s19', 'l5s7', 'l5s22', 'l5s15', 'l5s8', 'l5s9', 'l5s6', 'l5s11', 'l5s17', 'l5s23', 'l5s14', 'l5s4', 'l5s12', 'l5s13'],
};

export function winningLine(level: Level): readonly string[] {
  const line = WINNING_LINES[level.id];
  if (line === undefined) throw new Error(`No recorded line for level ${String(level.id)}.`);
  return line;
}

export interface PlayedLine {
  readonly taps: readonly string[];
  readonly state: LevelState;
}

/** Replay a sequence of screw ids on the real engine, stopping when the level ends. */
export function playLine(level: Level, line: readonly string[]): PlayedLine {
  const taps: string[] = [];
  let state = createState(level);

  for (const id of line) {
    if (state.status !== 'playing') break;
    state = resolveTap(level, state, { type: 'tap', targetId: id }).state;
    taps.push(id);
  }

  return { taps, state };
}

/**
 * The line a player taps when they have no plan: screws in the order they are
 * drawn, nothing read ahead. From level 3 on it ends in the pocket
 * overflowing, which is what makes it useful — it is the shortest honest way
 * to reach a real loss on screen.
 */
export function losingLine(level: Level): PlayedLine {
  return playLine(level, level.screws.map((screw) => screw.id));
}
