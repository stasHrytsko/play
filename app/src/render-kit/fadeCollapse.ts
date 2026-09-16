export interface FadeCollapseOptions {
  readonly duration?: number;
  readonly ease?: string;
  /** Call target.destroy() once the tween completes. Default true. */
  readonly destroy?: boolean;
}

const DEFAULTS: Required<FadeCollapseOptions> = {
  duration: 140,
  ease: 'Quad.easeIn',
  destroy: true,
};

/**
 * Scale and alpha to zero. For an object leaving the board for good: a
 * cleared target, a merged tile, a matched pair. The one effect every mechanic
 * in this codebase already needed — this is the same tween that was
 * previously hand-written inline in games/tap-targets/mechanic/render/LevelScene.ts.
 *
 * Resolves once the tween completes, after target.destroy() if destroy is true
 * (the default) — do not touch target after that point.
 */
export function fadeCollapse(
  target: Phaser.GameObjects.GameObject & { scaleX: number; scaleY: number; alpha: number },
  options: FadeCollapseOptions = {},
): Promise<void> {
  const { duration, ease, destroy } = { ...DEFAULTS, ...options };

  return new Promise((resolve) => {
    target.scene.tweens.add({
      targets: target,
      scaleX: 0,
      scaleY: 0,
      alpha: 0,
      duration,
      ease,
      onComplete: () => {
        if (destroy) target.destroy();
        resolve();
      },
    });
  });
}
