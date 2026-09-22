import Phaser from 'phaser';
import {
  cameraShake,
  fadeCollapse,
  invalidShake,
  moveTo,
  punch,
} from '../../../../src/render-kit/index.ts';
import { createState, resolveSwipe, targetCell } from '../engine/taxiEngine.ts';
import type {
  Direction,
  Level,
  LevelState,
  PassengerDefinition,
  SwipeAction,
  Taxi,
} from '../engine/types.ts';
import { boardGeometry, type BoardGeometry } from './geometry.ts';
import type { SceneTheme } from './theme.ts';

const SWIPE_THRESHOLD = 18;
const MOVE_DURATION = 135;

interface TaxiVisual {
  readonly container: Phaser.GameObjects.Container;
  readonly body: Phaser.GameObjects.Graphics;
  readonly glyph: Phaser.GameObjects.Text;
  readonly hitArea: Phaser.Geom.Rectangle;
}

interface PassengerVisual {
  readonly container: Phaser.GameObjects.Container;
  readonly timer: Phaser.GameObjects.Text;
}

interface Gesture {
  readonly taxiId: string;
  readonly x: number;
  readonly y: number;
}

export interface LevelSceneOptions {
  readonly level: Level;
  readonly theme: SceneTheme;
  readonly onFirstAction: () => void;
  readonly onComplete: () => void;
  readonly onFail: (reason: string) => void;
  readonly onStateChange: (state: LevelState) => void;
}

export class LevelScene extends Phaser.Scene {
  readonly #options: LevelSceneOptions;
  #grid!: Phaser.GameObjects.Graphics;
  readonly #taxis = new Map<string, TaxiVisual>();
  readonly #passengers = new Map<string, PassengerVisual>();

  #state: LevelState;
  #geometry: BoardGeometry = { x: 0, y: 0, side: 0, cell: 0 };
  #gesture: Gesture | null = null;
  #busy = false;
  #over = false;
  #firstActionReported = false;

  #handleResize = (size: Phaser.Structs.Size): void => {
    this.cameras.resize(size.width, size.height);
    this.#layout(size.width, size.height);
  };

  constructor(options: LevelSceneOptions) {
    super({ key: 'taxi-slide-level' });
    this.#options = options;
    this.#state = createState(options.level);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(this.#options.theme.background);
    this.#grid = this.add.graphics();

    for (const taxi of this.#options.level.taxis) this.#createTaxi(taxi);
    this.#syncPassengers();

    this.input.on(Phaser.Input.Events.POINTER_UP, (pointer: Phaser.Input.Pointer) => {
      void this.#finishGesture(pointer);
    });
    this.scale.on(Phaser.Scale.Events.RESIZE, this.#handleResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.#handleResize);
      this.input.off(Phaser.Input.Events.POINTER_UP);
    });

    this.#layout(this.scale.width, this.scale.height);
    this.#options.onStateChange(this.#state);
  }

  #createTaxi(taxi: Taxi): void {
    const body = this.add.graphics();
    const glyph = this.add.text(0, 0, this.#options.theme.colors[taxi.color].glyph, {
      fontFamily: 'system-ui, sans-serif',
      color: this.#options.theme.text,
      fontStyle: '700',
    });
    glyph.setOrigin(0.5);
    const container = this.add.container(0, 0, [body, glyph]);
    container.setDepth(2);
    const hitArea = new Phaser.Geom.Rectangle(-20, -20, 40, 40);
    body.setInteractive(
      hitArea,
      (area: Phaser.Geom.Rectangle, x: number, y: number) =>
        Phaser.Geom.Rectangle.Contains(area, x, y),
    );
    body.on(
      Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN,
      (pointer: Phaser.Input.Pointer) => {
        if (this.#busy || this.#over) return;
        this.#gesture = { taxiId: taxi.id, x: pointer.x, y: pointer.y };
        void punch(container, { scale: 1.06, duration: 100 });
      },
    );
    this.#taxis.set(taxi.id, { container, body, glyph, hitArea });
  }

  #createPassenger(passenger: PassengerDefinition): PassengerVisual {
    const style = this.#options.theme.colors[passenger.color];
    const ring = this.add.circle(0, 0, 18, style.fill);
    ring.setStrokeStyle(3, this.#options.theme.passengerRing, 1);
    const glyph = this.add.text(0, -5, style.glyph, {
      fontFamily: 'system-ui, sans-serif',
      color: this.#options.theme.text,
      fontStyle: '700',
    });
    glyph.setOrigin(0.5);
    const timer = this.add.text(0, 9, String(passenger.initialPatience), {
      fontFamily: 'system-ui, sans-serif',
      color: this.#options.theme.text,
      fontStyle: '800',
    });
    timer.setOrigin(0.5);
    const container = this.add.container(0, 0, [ring, glyph, timer]);
    container.setDepth(4);
    const visual = { container, timer };
    this.#passengers.set(passenger.id, visual);
    return visual;
  }

  #drawTaxi(visual: TaxiVisual, taxi: Taxi): void {
    const size = this.#geometry.cell * 0.78;
    const radius = Math.max(7, size * 0.18);
    visual.body.clear();
    visual.body.fillStyle(this.#options.theme.textDark, 0.1);
    visual.body.fillRoundedRect(-size / 2, -size / 2 + 3, size, size, radius);
    visual.body.fillStyle(this.#options.theme.colors[taxi.color].fill, 1);
    visual.body.fillRoundedRect(-size / 2, -size / 2, size, size, radius);
    visual.body.lineStyle(2, this.#options.theme.textDark, 0.13);
    visual.body.strokeRoundedRect(-size / 2, -size / 2, size, size, radius);
    visual.glyph.setFontSize(Math.round(size * 0.33));
    visual.hitArea.setTo(-size / 2, -size / 2, size, size);
  }

  #layout(width: number, height: number): void {
    this.#geometry = boardGeometry(width, height);
    const { x, y, side, cell } = this.#geometry;

    this.#grid.clear();
    this.#grid.fillStyle(this.#options.theme.board, 1);
    this.#grid.fillRoundedRect(x - 5, y - 5, side + 10, side + 10, 16);
    for (let row = 0; row < 5; row += 1) {
      for (let col = 0; col < 5; col += 1) {
        this.#grid.fillStyle(this.#options.theme.cell, 1);
        this.#grid.fillRoundedRect(
          x + col * cell + 2,
          y + row * cell + 2,
          cell - 4,
          cell - 4,
          Math.max(5, cell * 0.12),
        );
      }
    }

    for (const taxi of this.#state.taxis) {
      const visual = this.#taxis.get(taxi.id);
      if (visual === undefined) continue;
      this.#drawTaxi(visual, taxi);
      const point = this.#cellPoint(taxi.row, taxi.col);
      visual.container.setPosition(point.x, point.y);
    }
    this.#syncPassengers();
  }

  #cellPoint(row: number, col: number): { x: number; y: number } {
    return {
      x: this.#geometry.x + (col + 0.5) * this.#geometry.cell,
      y: this.#geometry.y + (row + 0.5) * this.#geometry.cell,
    };
  }

  #passengerPoint(passenger: PassengerDefinition): { x: number; y: number } {
    const cell = targetCell(passenger.target);
    const point = this.#cellPoint(cell.row, cell.col);
    const offset = this.#geometry.cell * 0.58;
    switch (passenger.target.side) {
      case 'top':
        return { x: point.x, y: this.#geometry.y - offset };
      case 'right':
        return { x: this.#geometry.x + this.#geometry.side + offset, y: point.y };
      case 'bottom':
        return { x: point.x, y: this.#geometry.y + this.#geometry.side + offset };
      case 'left':
        return { x: this.#geometry.x - offset, y: point.y };
    }
  }

  #syncPassengers(): void {
    const waitingIds = new Set(
      this.#state.passengers
        .filter((passenger) => passenger.status === 'waiting')
        .map((passenger) => passenger.id),
    );
    for (const [id, visual] of this.#passengers) {
      if (!waitingIds.has(id)) {
        visual.container.destroy();
        this.#passengers.delete(id);
      }
    }
    for (const passenger of this.#state.passengers) {
      if (passenger.status !== 'waiting') continue;
      const visual = this.#passengers.get(passenger.id) ?? this.#createPassenger(passenger);
      const radius = Math.max(15, this.#geometry.cell * 0.27);
      visual.container.setScale(radius / 18);
      visual.container.setPosition(...Object.values(this.#passengerPoint(passenger)) as [number, number]);
      visual.timer.setText(String(passenger.patience));
    }
  }

  async #finishGesture(pointer: Phaser.Input.Pointer): Promise<void> {
    const gesture = this.#gesture;
    this.#gesture = null;
    if (gesture === null || this.#busy || this.#over) return;
    const dx = pointer.x - gesture.x;
    const dy = pointer.y - gesture.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD) return;

    const direction: Direction =
      Math.abs(dx) >= Math.abs(dy)
        ? dx >= 0
          ? 'right'
          : 'left'
        : dy >= 0
          ? 'down'
          : 'up';
    await this.#swipe({
      type: 'swipe-taxi',
      taxiId: gesture.taxiId,
      direction,
    });
  }

  async #swipe(action: SwipeAction): Promise<void> {
    const outcome = resolveSwipe(this.#options.level, this.#state, action);
    const visual = this.#taxis.get(action.taxiId);
    if (outcome.ignored) return;
    if (!outcome.valid) {
      if (visual !== undefined) await invalidShake(visual.container);
      return;
    }

    this.#busy = true;
    if (!this.#firstActionReported) {
      this.#firstActionReported = true;
      this.#options.onFirstAction();
    }

    this.#state = outcome.state;
    this.#options.onStateChange(this.#state);

    if (visual !== undefined && outcome.to !== null) {
      const destination = this.#cellPoint(outcome.to.row, outcome.to.col);
      await moveTo(visual.container, destination.x, destination.y, { duration: MOVE_DURATION });
    }

    for (const pickup of outcome.pickups) {
      const taxiVisual = this.#taxis.get(pickup.taxiId);
      const passengerDefinition = this.#options.level.passengers.find(
        (passenger) => passenger.id === pickup.passengerId,
      );
      if (taxiVisual === undefined || passengerDefinition === undefined) continue;
      const passengerVisual =
        this.#passengers.get(pickup.passengerId) ?? this.#createPassenger(passengerDefinition);
      passengerVisual.container.setPosition(
        this.#passengerPoint(passengerDefinition).x,
        this.#passengerPoint(passengerDefinition).y,
      );
      const exit = this.#passengerPoint(passengerDefinition);
      await moveTo(taxiVisual.container, exit.x, exit.y, { duration: 180 });
      await Promise.all([
        fadeCollapse(taxiVisual.container, { duration: 130 }),
        fadeCollapse(passengerVisual.container, { duration: 130 }),
      ]);
      this.#taxis.delete(pickup.taxiId);
      this.#passengers.delete(pickup.passengerId);
    }

    this.#syncPassengers();
    this.#busy = false;

    if (this.#state.status === 'failed') {
      this.#over = true;
      await cameraShake(this, { duration: 220, intensity: 0.012 });
      this.#options.onFail(this.#state.failReason ?? 'passenger_timeout');
      return;
    }
    if (this.#state.status === 'won') {
      this.#over = true;
      this.time.delayedCall(180, this.#options.onComplete);
    }
  }
}
