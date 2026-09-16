/**
 * Shared Phaser effects for games/<slug>/mechanic/render/**.
 *
 * Content to be agreed separately (see docs/decisions.md) — this file is
 * scaffolding: the folder, its boundary and its dependency direction, not
 * yet the effects themselves.
 *
 * Contract:
 *  - Depends on Phaser only. Never on a specific game (games/<slug>/mechanic
 *    of any kind — engine or render), never on the shell (src/shell/**),
 *    never on Capacitor. Enforced by eslint.config.js, not just by this
 *    comment.
 *  - Consumed by games/<slug>/mechanic/render/** — a render module imports
 *    what it needs from here instead of writing its own tween. Nothing else
 *    imports it: games/<slug>/mechanic/engine/** stays pure (no Phaser at
 *    all, so no render-kit either), and src/shell/** stays DOM-only.
 *  - One file per effect once there is more than a couple — this single
 *    index.ts is a placeholder until the first effect lands.
 */
export {};
