/**
 * The single source of truth about one game — filled in per game under
 * games/<slug>/game.config.ts. Everything the shell needs to render itself
 * lives here, so no value is duplicated across LevelSelect, progress and the
 * mechanic.
 *
 * `levelCount` is not a free parameter: it is always 5 for this experiment
 * (docs/decisions.md, 2026-09-16 — was 9 in the original template). It stays
 * a field rather than a hard-coded constant so LevelSelect, progress and
 * `game.levelCount` never have three different numbers to keep in sync — but
 * a game.config.ts that sets it to anything but 5 is a mistake, not a choice.
 */
export interface GameDefinition {
  /** Stable slug: games/<id>/, the progress storage key, the signal payload. */
  id: string;
  /** Android application id, used only if this game is packaged in phase 2. */
  appId?: string;
  /** Shown on the main menu and as the Android app label. */
  title: string;
  /** One line under the title on the main menu. */
  tagline: string;
  /** Content version of the game itself. Bump when levels change. */
  version: number;

  /** Always 5. See the note on this interface. */
  levelCount: number;

  onboarding: {
    /** Bump this when the rules change — players will see the onboarding again. */
    version: number;
    title: string;
    /** Rule lines. Rendered as a list, one entry per rule. */
    rules: readonly string[];
  };

  analytics: {
    /** PostHog Project API key (phc_...). Public by design — see PostHogSignalSink. */
    postHogProjectToken: string;
    /** e.g. https://eu.i.posthog.com. Must match the project's data region. */
    postHogHost: string;
  };

  feedback: {
    /** Web3Forms access key for the comment popup. Not secret, but replace the placeholder. */
    web3formsAccessKey: string;
  };
}
