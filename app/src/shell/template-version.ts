/**
 * Which fork revision the shared shell (src/shell/**) is at. When a shell fix
 * lands here, this is what tells you it happened — "template is copied, not
 * inherited" no longer applies to the shell itself (docs/decisions.md,
 * 2026-09-16: shell is shared, only games/<slug>/mechanic is per game), but a
 * game's own dist/ build still needs rebuilding to pick up a shell change.
 *
 * 0.1.0: this is the initial 30/30 fork of game-template- (5 levels, PostHog,
 * Web3Forms, games/<slug> layout). The manual pass from the original
 * architecture doc §10 (desktop + real mobile browser, full flow, safe areas)
 * has not been redone against this layout yet — do that before day 1.
 */
export const TEMPLATE_VERSION = '0.1.0';
