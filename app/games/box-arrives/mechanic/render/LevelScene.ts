import Phaser from 'phaser';
import { invalidShake, moveTo, punch } from '../../../../src/render-kit/index.ts';
import { createState, resolveTap } from '../engine/boxEngine.ts';
import type { Level, LevelState, MoveOutcome, Screw } from '../engine/types.ts';
import { styleFor, type SceneTheme } from './theme.ts';

/** Screw radius as a fraction of the shorter canvas edge — thumb-sized on a phone. */
const SCREW_RADIUS_RATIO = 0.062;
const MIN_SCREW_RADIUS = 18;
/** Where a matched screw flies to: the HUD boxes live below the canvas. */
const EXIT_Y_RATIO = 1.25;
const FLY_DURATION = 190;

export interface LevelSceneOptions {
  level: Level;
  theme: SceneTheme;
  onFirstAction: () => void;
  onComplete: () => void;
  onFail: (reason: string) => void;
  onStateChange: (state: LevelState, outcome: MoveOutcome | null) => void;
}

/**
 * The rendering and input half of the mechanic.
 *
 * Every rule lives in ../engine — this scene draws state and turns pointer
 * events into engine inputs. It never decides what a tap means; it asks the
 * engine and animates the answer.
 */
export class LevelScene extends Phaser.Scene {
  readonly #options: LevelSceneOptions;
  readonly #heads = new Map<string, Phaser.GameObjects.Arc>();
  readonly #shadows = new Map<string, Phaser.GameObjects.Arc>();
  readonly #glyphs = new Map<string, Phaser.GameObjects.Text>();
  /**
   * Hit areas are kept by reference rather than read back off `arc.input`,
   * whose `hitArea` is typed `any`. Phaser hit-tests in local space with the
   * display origin added, so for an Arc of radius r the centre sits at (r, r).
   */
  readonly #hitAreas = new Map<string, Phaser.Geom.Circle>();

  #state: LevelState;
  #over = false;
  #firstActionReported = false;

  #handleResize = (gameSize: Phaser.Structs.Size): void => {
    this.cameras.resize(gameSize.width, gameSize.height);
    this.#layout(gameSize.width, gameSize.height);
  };

  constructor(options: LevelSceneOptions) {
    super({ key: 'level' });
    this.#options = options;
    this.#state = createState(options.level);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(this.#options.theme.background);

    for (const screw of this.#options.level.screws) {
      this.#addScrew(screw);
    }

    this.#layout(this.scale.width, this.scale.height);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.#handleResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.#handleResize);
    });

    this.#options.onStateChange(this.#state, null);
  }

  #addScrew(screw: Screw): void {
    const style = styleFor(this.#options.theme, screw.color);

    const shadow = this.add.circle(0, 0, MIN_SCREW_RADIUS, this.#options.theme.screwShadow, 0.1);
    shadow.setDepth(0);

    const head = this.add.circle(0, 0, MIN_SCREW_RADIUS, style.fill);
    head.setDepth(1);
    head.setStrokeStyle(2, this.#options.theme.screwStroke, 0.14);

    // Second channel alongside hue — see ColorStyle.glyph in theme.ts.
    const glyph = this.add.text(0, 0, style.glyph, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '16px',
      color: this.#options.theme.glyphColor,
    });
    glyph.setOrigin(0.5, 0.5);
    glyph.setDepth(2);

    const hitArea = new Phaser.Geom.Circle(MIN_SCREW_RADIUS, MIN_SCREW_RADIUS, MIN_SCREW_RADIUS);
    head.setInteractive(hitArea, (area: Phaser.Geom.Circle, x: number, y: number) =>
      Phaser.Geom.Circle.Contains(area, x, y),
    );
    head.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
      this.#tap(screw.id);
    });

    this.#shadows.set(screw.id, shadow);
    this.#heads.set(screw.id, head);
    this.#glyphs.set(screw.id, glyph);
    this.#hitAreas.set(screw.id, hitArea);
  }

  #layout(width: number, height: number): void {
    const radius = Math.max(MIN_SCREW_RADIUS, Math.min(width, height) * SCREW_RADIUS_RATIO);

    for (const screw of this.#options.level.screws) {
      // A screw already gone keeps its objects (the resize path looks them up
      // by id) but must not be dragged back onto the plate by a relayout.
      if (!this.#state.remainingScrews.includes(screw.id)) continue;

      const head = this.#heads.get(screw.id);
      const shadow = this.#shadows.get(screw.id);
      const glyph = this.#glyphs.get(screw.id);
      const hitArea = this.#hitAreas.get(screw.id);
      if (head === undefined || shadow === undefined || glyph === undefined || hitArea === undefined) {
        continue;
      }

      const x = screw.x * width;
      const y = screw.y * height;

      shadow.setRadius(radius * 1.02);
      shadow.setPosition(x, y + radius * 0.12);

      head.setRadius(radius);
      head.setPosition(x, y);

      glyph.setFontSize(Math.round(radius * 0.9));
      glyph.setPosition(x, y);

      hitArea.setTo(radius, radius, radius);
    }
  }

  #tap(screwId: string): void {
    if (this.#over) return;

    const outcome = resolveTap(this.#options.level, this.#state, {
      type: 'tap',
      targetId: screwId,
    });
    if (outcome.ignored) return;

    if (!this.#firstActionReported) {
      this.#firstActionReported = true;
      this.#options.onFirstAction();
    }

    this.#state = outcome.state;

    const head = this.#heads.get(screwId);
    head?.disableInteractive();

    if (outcome.state.status === 'failed') {
      // §7: the pocket jolts, the screw has nowhere to stand, the fail lands.
      // The shake plays on the screw that could not be placed.
      if (head !== undefined) void invalidShake(head);
      this.#over = true;
      this.#options.onStateChange(this.#state, outcome);
      this.time.delayedCall(260, () => {
        this.#options.onFail(outcome.state.failReason ?? 'pocket_overflow');
      });
      return;
    }

    // §7: matched screws fly to their box, unmatched ones to a pocket slot.
    // Both leave through the bottom edge — the boxes and the pocket are DOM
    // below the canvas, so the canvas only has to hand the screw over.
    const targetX = outcome.matched
      ? this.scale.width * (outcome.matchedBoxIndex === 0 ? 0.3 : 0.5)
      : this.scale.width * 0.84;

    this.#flyOut(screwId, targetX);

    this.#options.onStateChange(this.#state, outcome);

    if (outcome.state.status === 'won') {
      this.#over = true;
      // Let the last screw land before the shell drops a popup over the board.
      this.time.delayedCall(FLY_DURATION + 120, this.#options.onComplete);
    }
  }

  #flyOut(screwId: string, targetX: number): void {
    const head = this.#heads.get(screwId);
    const shadow = this.#shadows.get(screwId);
    const glyph = this.#glyphs.get(screwId);
    const targetY = this.scale.height * EXIT_Y_RATIO;

    if (head !== undefined) {
      void punch(head, { scale: 1.18, duration: 90 });
      void moveTo(head, targetX, targetY, { duration: FLY_DURATION });
    }
    if (glyph !== undefined) {
      void moveTo(glyph, targetX, targetY, { duration: FLY_DURATION });
    }
    if (shadow !== undefined) {
      shadow.setVisible(false);
    }
  }
}
