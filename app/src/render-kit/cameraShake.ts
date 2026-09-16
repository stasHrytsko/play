export interface CameraShakeOptions {
  readonly duration?: number;
  /** Fraction of camera size, same unit Phaser's own Camera.shake uses. */
  readonly intensity?: number;
}

const DEFAULTS: Required<CameraShakeOptions> = {
  duration: 200,
  intensity: 0.01,
};

/**
 * Shakes the whole game camera, not one object. For the rare moment that is
 * bigger than any single tile — a structural failure, a board-wide cascade
 * landing. Reach for invalidShake first; this is for when the whole board
 * should react, not one piece.
 *
 * Resolves once the shake completes.
 */
export function cameraShake(scene: Phaser.Scene, options: CameraShakeOptions = {}): Promise<void> {
  const { duration, intensity } = { ...DEFAULTS, ...options };

  return new Promise((resolve) => {
    scene.cameras.main.shake(duration, intensity, false, (_camera: Phaser.Cameras.Scene2D.Camera, progress: number) => {
      if (progress === 1) resolve();
    });
  });
}
