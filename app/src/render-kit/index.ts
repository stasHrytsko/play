/**
 * Shared Phaser effects for games/<slug>/mechanic/render/**.
 *
 * Fixed set, agreed 2026-09-16 after a survey of the 30/30 canonical shelf
 * (docs/decisions.md) — five in-place effects plus one movement primitive.
 * A new game reaches for these instead of writing its own tween. If a
 * mechanic seems to need a seventh, that's a decision to make explicitly
 * (same rule as widening shell-contract.ts), not something to add quietly
 * here.
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
 *  - Every effect returns Promise<void>, resolving when it's visually done —
 *    so a render module can `await` a sequence instead of nesting
 *    onComplete callbacks.
 */
export { cameraShake, type CameraShakeOptions } from './cameraShake.ts';
export { fadeCollapse, type FadeCollapseOptions } from './fadeCollapse.ts';
export { invalidShake, type InvalidShakeOptions } from './invalidShake.ts';
export { moveTo, type MoveToOptions } from './moveTo.ts';
export { punch, type PunchOptions } from './punch.ts';
export { successFlash, type SuccessFlashOptions, type Tintable } from './successFlash.ts';
