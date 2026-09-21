/**
 * Types of the Box Arrives mechanic. Rules live in boxEngine.ts and nowhere
 * else: no Phaser, no DOM, no storage. The linter enforces that, not
 * discipline.
 *
 * Spec: ../../../../../specs/01-box-arrives.md (sections 3–5).
 */

/** A screw on the plate. Coordinates are normalised 0..1 — layout is the renderer's job. */
export interface Screw {
  readonly id: string;
  readonly color: string;
  readonly x: number;
  readonly y: number;
}

export interface Level {
  /** 1-based level number, matching the position in levels.json. */
  readonly id: number;
  /** Moves between box shifts. Spec §3.2, §3.9. */
  readonly shiftEvery: number;
  /** Pocket capacity. Overflowing it loses the level (§3.7). */
  readonly pocketSize: number;
  /** How many upcoming boxes the HUD shows (§7). Renderer-only. */
  readonly queuePreview: number;
  readonly screws: readonly Screw[];
  /** First two are the active boxes, the rest is the queue (§6). */
  readonly boxes: readonly string[];
}

export interface PocketSlot {
  readonly screwId: string;
  readonly color: string;
}

export type LevelStatus = 'playing' | 'won' | 'failed';

/** Stable machine-readable loss code, passed to the shell's onFail (§10). */
export type FailReason = 'pocket_overflow';

export interface LevelState {
  readonly remainingScrews: readonly string[];
  readonly pocket: readonly PocketSlot[];
  readonly activeBoxes: readonly [string, string];
  readonly boxQueue: readonly string[];
  readonly moves: number;
  readonly movesUntilShift: number;
  readonly status: LevelStatus;
  readonly failReason: FailReason | null;
}

export interface TapInput {
  readonly type: 'tap';
  readonly targetId: string;
}

/**
 * What one tap actually did, for the renderer and for analytics. The engine
 * stays pure; the renderer needs to know *which* animation to play, and
 * re-deriving that by diffing two states would duplicate the rules.
 */
export interface MoveOutcome {
  readonly state: LevelState;
  /** The tap changed nothing: no such screw, or the level is already over. */
  readonly ignored: boolean;
  /** Screw matched an active box and flew straight there. */
  readonly matched: boolean;
  /** Which of the two active boxes took it — the renderer aims the animation. */
  readonly matchedBoxIndex: 0 | 1 | null;
  /** Screw went into the pocket instead. */
  readonly pocketed: boolean;
  /** Boxes shifted on this move (§3.9). */
  readonly shifted: boolean;
  /** Screws that left the pocket because the shift brought their colour (§3.10). */
  readonly flushed: readonly PocketSlot[];
}

export interface MechanicEngine<TState, TInput, TLevel> {
  create(level: TLevel): TState;
  apply(state: TState, input: TInput): TState;
  isComplete(state: TState): boolean;
}
