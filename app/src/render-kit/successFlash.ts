export interface SuccessFlashOptions {
  /** Hex color, e.g. 0xffffff for white. */
  readonly color?: number;
  readonly duration?: number;
}

const DEFAULTS: Required<SuccessFlashOptions> = {
  color: 0xffffff,
  duration: 180,
};

/** A GameObject that supports Phaser's tint component — Sprite, Image. */
export type Tintable = Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Tint;

/**
 * A brief solid-colour tint, then back to normal. For "this was the right
 * move" on an object that stays on screen — not for something about to
 * disappear (fadeCollapse) or a value that just changed (punch).
 *
 * Tint is a Sprite/Image feature, not something every GameObject has — a
 * Phaser Shape (Arc, Rectangle, the ones the stub mechanic uses today) has no
 * setTint. Calling this on one is a TypeScript error, not a silent no-op:
 * use punch on shapes instead of reaching for a color this object can't show.
 *
 * Resolves once the tint has been cleared.
 */
export function successFlash(target: Tintable, options: SuccessFlashOptions = {}): Promise<void> {
  const { color, duration } = { ...DEFAULTS, ...options };

  target.setTint(color);

  return new Promise((resolve) => {
    target.scene.time.delayedCall(duration, () => {
      target.clearTint();
      resolve();
    });
  });
}
