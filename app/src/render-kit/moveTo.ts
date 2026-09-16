export interface MoveToOptions {
  readonly duration?: number;
  readonly ease?: string;
}

const DEFAULTS: Required<MoveToOptions> = {
  duration: 200,
  ease: 'Sine.easeInOut',
};

/**
 * A plain position tween — a screw dropping into its container, a car sliding
 * into a parking slot, a branch's tip advancing, water travelling a pipe
 * segment. Added after a survey of the 30/30 canonical shelf
 * (docs/decisions.md): most concepts move something from A to B, not just in
 * place, and punch/invalidShake/successFlash/fadeCollapse/cameraShake are all
 * in-place effects — this is the one that isn't.
 *
 * Resolves once the object is at (x, y).
 */
export function moveTo(
  target: Phaser.GameObjects.GameObject & { x: number; y: number },
  x: number,
  y: number,
  options: MoveToOptions = {},
): Promise<void> {
  const { duration, ease } = { ...DEFAULTS, ...options };

  return new Promise((resolve) => {
    target.scene.tweens.add({
      targets: target,
      x,
      y,
      duration,
      ease,
      onComplete: () => {
        resolve();
      },
    });
  });
}
