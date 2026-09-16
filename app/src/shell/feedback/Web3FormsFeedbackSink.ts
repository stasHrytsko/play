import type { FeedbackSink, GameFeedback } from './FeedbackSink.ts';

const WEB3FORMS_ENDPOINT = 'https://api.web3forms.com/submit';
const SEND_TIMEOUT_MS = 8_000;

/**
 * Emails a player's comment to the project owner via Web3Forms — no backend,
 * no serverless function (docs/decisions.md, 2026-09-16). The star rating
 * never goes through here: it goes to PostHog as `rating_submit`, where it
 * can actually be aggregated. This sink only carries the one thing PostHog
 * should not store — free text.
 *
 * The free tier is 250 submissions/month. Comments are optional, so phase 1
 * (one game/day) stays well under that; a popular game in the phase 2
 * tournament could approach it — upgrade then, not preemptively.
 */
export class Web3FormsFeedbackSink implements FeedbackSink {
  readonly #accessKey: string;
  readonly #fetch: typeof globalThis.fetch;

  constructor(accessKey: string, fetchImpl: typeof globalThis.fetch = globalThis.fetch.bind(globalThis)) {
    this.#accessKey = accessKey;
    this.#fetch = fetchImpl;
  }

  async send(feedback: GameFeedback): Promise<void> {
    try {
      const response = await this.#fetch(WEB3FORMS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          access_key: this.#accessKey,
          subject: `[30/30] Комментарий — ${feedback.gameTitle}`,
          game_id: feedback.gameId,
          comment: feedback.comment,
        }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });

      if (!response.ok) {
        console.warn(`[feedback] web3forms responded ${String(response.status)}`);
      }
    } catch (error) {
      // Same rule as SignalSink: an unreachable network must never surface to
      // the player.
      console.warn('[feedback] delivery failed', error);
    }
  }
}
