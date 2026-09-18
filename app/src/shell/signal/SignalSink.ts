/**
 * Everything the shell reports back about a play session.
 *
 * The shell must never learn how a signal is delivered — swapping PostHog for
 * something else is a one-line change in src/shell/boot.ts and nowhere else.
 *
 * This list is the shell-observable subset of "13 — Правила эксперимента
 * 30/30" §7. Three groups from that document are deliberately NOT here:
 *
 *  - hub_impression, hub_click, teaser_click — fired by the hub site itself
 *    (stasHrytsko/play, analytics-config.js), not by an individual game.
 *  - session_2, return_d1, return_d7 — not fired as custom events at all.
 *    PostHog assigns a persistent distinct_id per browser and computes
 *    retention (D1/D7, N-session) from that plus `game_open` natively, via
 *    its own Retention insight — firing our own "day 2" event would just be a
 *    second, worse copy of analysis PostHog already does.
 */

export type GameEventName =
  | 'game_open'
  | 'help_open'
  | 'first_action'
  | 'level_start'
  | 'level_win'
  | 'level_fail'
  | 'retry'
  | 'level_5_complete'
  | 'rating_submit'
  | 'comment_submit';

export interface GameSignal {
  /** GameDefinition.id — never anything derived from the player. */
  readonly gameId: string;
  readonly event: GameEventName;
  /** 0-based level index. Present for level lifecycle/action events. */
  readonly level?: number;
  /** Stable mechanic-owned failure code. Present only for level_fail. */
  readonly reason?: string;
  /** 1-5. Present only for rating_submit. */
  readonly rating?: number;
  /** GameDefinition.version, so a metric can be split by content revision. */
  readonly version?: number;
}

export interface SignalSink {
  /**
   * Deliver the signal. Implementations must resolve even on failure: a lost
   * signal is a lost data point, not a reason to break the player's game.
   */
  send(signal: GameSignal): Promise<void>;
}

/** For tests, local development, and any build that must stay silent. */
export class NoopSignalSink implements SignalSink {
  readonly sent: GameSignal[] = [];

  send(signal: GameSignal): Promise<void> {
    this.sent.push(signal);
    return Promise.resolve();
  }
}
