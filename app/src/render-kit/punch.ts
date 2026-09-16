export interface PunchOptions {
  /** Peak scale relative to the object's scale when the punch starts. */
  readonly scale?: number;
  readonly duration?: number;
  readonly ease?: string;
}

const DEFAULTS: Required<PunchOptions> = {
  scale: 1.15,
  duration: 160,
  ease: 'Back.easeOut',
};

/**
 * A quick scale bounce — up then back to whatever scale the object already
 * had. For positive feedback on an object that stays: a correct tap, a piece
 * landing, a value ticking up. Not for something that is about to disappear —
 * that's fadeCollapse.
 *
 * Resolves once the object is back at its starting scale.
 */
export function punch(
  target: Phaser.GameObjects.GameObject & { scaleX: number; scaleY: number },
  options: PunchOptions = {},
): Promise<void> {
  const { scale, duration, ease } = { ...DEFAULTS, ...options };
  const fromX = target.scaleX;
  const fromY = target.scaleY;

  return new Promise((resolve) => {
    target.scene.tweens.add({
      targets: target,
      scaleX: fromX * scale,
      scaleY: fromY * scale,
      duration: duration / 2,
      ease,
      yoyo: true,
      onComplete: () => {
        resolve();
      },
    });
  });
}
