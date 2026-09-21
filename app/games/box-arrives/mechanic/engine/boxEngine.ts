import type {
  Level,
  LevelState,
  MechanicEngine,
  MoveOutcome,
  PocketSlot,
  Screw,
  TapInput,
} from './types.ts';

/**
 * Box Arrives — the rules, and nothing else.
 *
 * Numbered comments below refer to specs/01-box-arrives.md §3. Every branch
 * here maps to exactly one numbered rule; if a branch has no number, it does
 * not belong in this file.
 */

function screwById(level: Level, id: string): Screw | undefined {
  return level.screws.find((screw) => screw.id === id);
}

function accepts(activeBoxes: readonly [string, string], color: string): boolean {
  return activeBoxes[0] === color || activeBoxes[1] === color;
}

/** §3.1–3.2: two active boxes, the rest is the queue; counter starts full, pocket empty. */
export function createState(level: Level): LevelState {
  const [first, second] = level.boxes;
  if (first === undefined || second === undefined) {
    throw new Error(`Level ${String(level.id)} needs at least two boxes.`);
  }

  return {
    remainingScrews: level.screws.map((screw) => screw.id),
    pocket: [],
    activeBoxes: [first, second],
    boxQueue: level.boxes.slice(2),
    moves: 0,
    movesUntilShift: level.shiftEvery,
    status: 'playing',
    failReason: null,
  };
}

const IGNORED = {
  ignored: true,
  matched: false,
  matchedBoxIndex: null,
  pocketed: false,
  shifted: false,
  flushed: [] as readonly PocketSlot[],
} as const;

/**
 * One tap, fully resolved. Returns what happened as well as the new state:
 * the renderer needs to know which animation to play, and re-deriving that by
 * diffing two states would be the rules written twice.
 */
export function resolveTap(level: Level, state: LevelState, input: TapInput): MoveOutcome {
  if (state.status !== 'playing') return { state, ...IGNORED };

  // §3.3: only a screw still on the plate is tappable. Anything else — the
  // HUD, a box, the pocket, empty space — is not a game action (§5).
  if (!state.remainingScrews.includes(input.targetId)) return { state, ...IGNORED };

  const screw = screwById(level, input.targetId);
  if (screw === undefined) return { state, ...IGNORED };

  // §3.4: a valid tap unscrews the screw and counts as one move.
  const remainingScrews = state.remainingScrews.filter((id) => id !== input.targetId);
  const moves = state.moves + 1;

  const matched = accepts(state.activeBoxes, screw.color);
  const matchedBoxIndex = matched ? (state.activeBoxes[0] === screw.color ? 0 : 1) : null;

  // §3.7: no match and the pocket is already full — the screw is out of the
  // plate with nowhere to go, and the level is lost immediately.
  if (!matched && state.pocket.length >= level.pocketSize) {
    return {
      state: {
        ...state,
        remainingScrews,
        moves,
        status: 'failed',
        failReason: 'pocket_overflow',
      },
      ignored: false,
      matched: false,
      matchedBoxIndex: null,
      pocketed: false,
      shifted: false,
      flushed: [],
    };
  }

  // §3.5 / §3.6: straight into a box, or into the first free pocket slot.
  const pocketed = !matched;
  let pocket: readonly PocketSlot[] = pocketed
    ? [...state.pocket, { screwId: screw.id, color: screw.color }]
    : state.pocket;

  // §3.8: the shift counter ticks down on every successful move.
  let movesUntilShift = state.movesUntilShift - 1;
  let activeBoxes = state.activeBoxes;
  let boxQueue = state.boxQueue;
  let flushed: readonly PocketSlot[] = [];
  const nextBox = boxQueue[0];

  // §3.9: at zero the left box leaves, the right one slides over, the head of
  // the queue arrives on the right, and the counter resets.
  //
  // `nextBox !== undefined` is unreachable with valid content: parseLevelPack
  // requires enough boxes for every shift the screw count can trigger. Kept as
  // a guard rather than a crash, because a content bug should not take the
  // whole level down mid-play.
  const shifted = movesUntilShift === 0 && nextBox !== undefined;
  if (shifted && nextBox !== undefined) {
    activeBoxes = [state.activeBoxes[1], nextBox];
    boxQueue = boxQueue.slice(1);
    movesUntilShift = level.shiftEvery;

    // §3.10: whatever the new pair accepts leaves the pocket at once. Not a move.
    flushed = pocket.filter((slot) => accepts(activeBoxes, slot.color));
    pocket = pocket.filter((slot) => !accepts(activeBoxes, slot.color));
  }

  // §3.12: the win is checked after the move is fully resolved. The plate is
  // what has to be empty — §2 says nothing about the pocket, and a screw left
  // parked there does not withhold the win.
  const status = remainingScrews.length === 0 ? 'won' : 'playing';

  return {
    state: {
      remainingScrews,
      pocket,
      activeBoxes,
      boxQueue,
      moves,
      movesUntilShift,
      status,
      failReason: null,
    },
    ignored: false,
    matched,
    matchedBoxIndex,
    pocketed,
    shifted,
    flushed,
  };
}

export function isComplete(state: LevelState): boolean {
  return state.status === 'won';
}

/**
 * The template's engine shape, closed over the level. Box Arrives needs
 * `shiftEvery` and `pocketSize` to resolve a tap, and those are level data —
 * carrying them inside the state instead would be the same numbers in two
 * places.
 */
export function createBoxEngine(
  level: Level,
): MechanicEngine<LevelState, TapInput, Level> & {
  resolve(state: LevelState, input: TapInput): MoveOutcome;
} {
  return {
    create: (forLevel: Level): LevelState => createState(forLevel),
    apply: (state: LevelState, input: TapInput): LevelState =>
      resolveTap(level, state, input).state,
    resolve: (state: LevelState, input: TapInput): MoveOutcome =>
      resolveTap(level, state, input),
    isComplete,
  };
}
