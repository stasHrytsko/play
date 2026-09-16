/**
 * Free-text feedback from the rating popup.
 *
 * Deliberately separate from SignalSink: a star rating is a metric (goes to
 * PostHog, feeds Ворота 3) and free text is content someone has to actually
 * read — mixing the two would either pollute PostHog with unstructured text
 * or make the rating hard to aggregate. See docs/decisions.md, 2026-09-16.
 */
export interface GameFeedback {
  readonly gameId: string;
  readonly gameTitle: string;
  readonly comment: string;
}

export interface FeedbackSink {
  /** Implementations must resolve even on failure — same rule as SignalSink. */
  send(feedback: GameFeedback): Promise<void>;
}

/** For tests, local development, and any build that must stay silent. */
export class NoopFeedbackSink implements FeedbackSink {
  readonly sent: GameFeedback[] = [];

  send(feedback: GameFeedback): Promise<void> {
    this.sent.push(feedback);
    return Promise.resolve();
  }
}
