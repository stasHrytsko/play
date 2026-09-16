export interface InvalidShakeOptions {
  /** Peak horizontal offset in pixels. */
  readonly magnitude?: number;
  readonly duration?: number;
}

const DEFAULTS: Required<InvalidShakeOptions> = {
  magnitude: 6,
  duration: 150,
};

/**
 * A short left-right shake at the object's own position. For a move that
 * didn't work: a tap on a locked tile, a drop with nowhere to land. Reads as
 * "no" without a popup.
 *
 * Resolves once the object is back at its starting position.
 */
export function invalidShake(
  target: Phaser.GameObjects.GameObject & { x: number },
  options: InvalidShakeOptions = {},
): Promise<void> {
  const { magnitude, duration } = { ...DEFAULTS, ...options };
  const fromX = target.x;

  return new Promise((resolve) => {
    target.scene.tweens.chain({
      targets: target,
      tweens: [
        { x: fromX - magnitude, duration: duration / 4, ease: 'Sine.easeOut' },
        { x: fromX + magnitude, duration: duration / 2, ease: 'Sine.easeInOut' },
        { x: fromX, duration: duration / 4, ease: 'Sine.easeIn' },
      ],
      onComplete: () => {
        resolve();
      },
    });
  });
}
