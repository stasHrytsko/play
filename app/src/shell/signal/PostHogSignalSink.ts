import posthog from 'posthog-js';
import type { GameSignal, SignalSink } from './SignalSink.ts';

export interface PostHogSignalSinkOptions {
  /** Project API key (phc_...). Write-only, safe to ship in a public bundle. */
  readonly projectToken: string;
  /** e.g. https://eu.i.posthog.com — must match the project's data region. */
  readonly host: string;
}

/**
 * Sends every shell-observable event (SignalSink.ts) to PostHog. Replaces
 * NtfySignalSink (docs/decisions.md, 2026-09-16): the experiment's rules need
 * a full behavioural log, not one "would you like more" ping.
 *
 * anonymous_user_id / session_id / timestamp from "13 — Правила эксперимента
 * 30/30" §7 are not passed explicitly — PostHog assigns and persists its own
 * distinct_id and $session_id per browser, and stamps every event server-side.
 * Maintaining a second identity system alongside it would only create a way
 * for the two to disagree.
 */
export class PostHogSignalSink implements SignalSink {
  #initialised = false;
  readonly #options: PostHogSignalSinkOptions;

  constructor(options: PostHogSignalSinkOptions) {
    this.#options = options;
  }

  #ensureInit(): void {
    if (this.#initialised) return;
    posthog.init(this.#options.projectToken, {
      api_host: this.#options.host,
      person_profiles: 'always',
      // Prototypes need exactly the events the shell fires — no session
      // replay, no autocaptured clicks, no automatic pageview noise.
      autocapture: false,
      capture_pageview: false,
    });
    this.#initialised = true;
  }

  send(signal: GameSignal): Promise<void> {
    try {
      this.#ensureInit();
      const { event, gameId, ...properties } = signal;
      posthog.capture(event, { game_id: gameId, ...properties });
    } catch (error) {
      // Same contract as every SignalSink: a lost signal must never break the
      // player's game.
      console.warn('[signal] posthog capture failed', error);
    }
    return Promise.resolve();
  }
}
