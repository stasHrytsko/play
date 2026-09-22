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
type TaxiOrientation = 'front' | 'side';

interface TaxiVisual {
  readonly container: Phaser.GameObjects.Container;
  readonly body: Phaser.GameObjects.Graphics;
  readonly hitArea: Phaser.Geom.Rectangle;
}

interface PassengerVisual {
  readonly container: Phaser.GameObjects.Container;
  readonly body: Phaser.GameObjects.Graphics;
  readonly timerBadge: Phaser.GameObjects.Graphics;
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
  readonly #taxiOrientations = new Map<string, TaxiOrientation>();
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
    const container = this.add.container(0, 0, [body]);
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
    const numericId = Number.parseInt(taxi.id.replace(/\D/g, ''), 10);
    this.#taxiOrientations.set(taxi.id, numericId % 2 === 0 ? 'front' : 'side');
    this.#taxis.set(taxi.id, { container, body, hitArea });
  }

  #createPassenger(passenger: PassengerDefinition): PassengerVisual {
    const body = this.add.graphics();
    const timerBadge = this.add.graphics();
    const timer = this.add.text(0, 0, String(passenger.initialPatience), {
      fontFamily: 'system-ui, sans-serif',
      color: this.#options.theme.timerText,
      fontStyle: '800',
    });
    timer.setOrigin(0.5);
    const container = this.add.container(0, 0, [body, timerBadge, timer]);
    container.setDepth(4);
    const visual = { container, body, timerBadge, timer };
    this.#passengers.set(passenger.id, visual);
    return visual;
  }

  #drawTaxi(visual: TaxiVisual, taxi: Taxi): void {
    const size = this.#geometry.cell * 0.8;
    const orientation = this.#taxiOrientations.get(taxi.id) ?? 'front';
    const color = this.#options.theme.colors[taxi.color].fill;
    const shadow = this.#options.theme.textDark;
    visual.body.clear();

    if (orientation === 'side') {
      const width = size;
      const height = size * 0.56;
      const x = -width / 2;
      const y = -height / 2;
      const wheel = Math.max(4, size * 0.11);

      visual.body.fillStyle(shadow, 0.16);
      visual.body.fillRoundedRect(x, y + 3, width, height, Math.max(7, size * 0.15));
      visual.body.fillStyle(color, 1);
      visual.body.fillRoundedRect(x, y, width, height, Math.max(7, size * 0.15));
      visual.body.lineStyle(2, shadow, 0.15);
      visual.body.strokeRoundedRect(x, y, width, height, Math.max(7, size * 0.15));

      const windowWidth = width * 0.46;
      const windowHeight = height * 0.38;
      const windowX = -windowWidth / 2;
      const windowY = y + height * 0.14;
      visual.body.fillStyle(this.#options.theme.glass, 1);
      visual.body.fillRoundedRect(windowX, windowY, windowWidth, windowHeight, Math.max(3, size * 0.06));
      visual.body.fillStyle(this.#options.theme.glassDivider, 0.5);
      visual.body.fillRect(-1, windowY, 2, windowHeight);

      visual.body.fillStyle(this.#options.theme.wheel, 1);
      visual.body.fillRoundedRect(x + width * 0.14, y + height - wheel * 0.35, wheel, wheel * 0.7, 3);
      visual.body.fillRoundedRect(x + width * 0.76, y + height - wheel * 0.35, wheel, wheel * 0.7, 3);
    } else {
      const width = size * 0.66;
      const height = size;
      const x = -width / 2;
      const y = -height / 2;
      const wheelWidth = Math.max(4, size * 0.08);

      visual.body.fillStyle(shadow, 0.16);
      visual.body.fillRoundedRect(x, y + 3, width, height, Math.max(7, size * 0.15));
      visual.body.fillStyle(color, 1);
      visual.body.fillRoundedRect(x, y, width, height, Math.max(7, size * 0.15));
      visual.body.lineStyle(2, shadow, 0.15);
      visual.body.strokeRoundedRect(x, y, width, height, Math.max(7, size * 0.15));

      const windowWidth = width * 0.68;
      const windowHeight = height * 0.28;
      visual.body.fillStyle(this.#options.theme.glass, 1);
      visual.body.fillRoundedRect(-windowWidth / 2, y + height * 0.15, windowWidth, windowHeight, Math.max(3, size * 0.06));

      visual.body.fillStyle(this.#options.theme.wheel, 1);
      visual.body.fillRoundedRect(x - wheelWidth * 0.45, y + height * 0.25, wheelWidth, height * 0.24, 3);
      visual.body.fillRoundedRect(x + width - wheelWidth * 0.55, y + height * 0.25, wheelWidth, height * 0.24, 3);
      visual.body.fillRoundedRect(x - wheelWidth * 0.45, y + height * 0.65, wheelWidth, height * 0.18, 3);
      visual.body.fillRoundedRect(x + width - wheelWidth * 0.55, y + height * 0.65, wheelWidth, height * 0.18, 3);
    }

    visual.hitArea.setTo(-size / 2, -size / 2, size, size);
  }

  #drawPassenger(visual: PassengerVisual, passenger: PassengerDefinition): void {
    const size = Math.max(34, this.#geometry.cell * 0.62);
    const color = this.#options.theme.colors[passenger.color].fill;
    const outline = this.#options.theme.passengerRing;
    visual.body.clear();

    visual.body.fillStyle(this.#options.theme.textDark, 0.14);
    visual.body.fillEllipse(0, size * 0.43, size * 0.64, size * 0.18);

    visual.body.lineStyle(Math.max(4, size * 0.12), color, 1);
    visual.body.lineBetween(-size * 0.1, size * 0.16, -size * 0.2, size * 0.48);
    visual.body.lineBetween(size * 0.1, size * 0.16, size * 0.2, size * 0.48);
    visual.body.lineBetween(-size * 0.14, -size * 0.05, -size * 0.3, size * 0.2);
    visual.body.lineBetween(size * 0.14, -size * 0.05, size * 0.3, size * 0.2);

    visual.body.fillStyle(color, 1);
    visual.body.fillRoundedRect(-size * 0.19, -size * 0.16, size * 0.38, size * 0.48, Math.max(5, size * 0.12));
    visual.body.fillStyle(outline, 1);
    visual.body.fillCircle(0, -size * 0.32, size * 0.16);
    visual.body.fillStyle(this.#options.theme.skin, 1);
    visual.body.fillCircle(0, -size * 0.32, size * 0.12);

    const badgeRadius = Math.max(10, size * 0.2);
    const badgeX = size * 0.34;
    const badgeY = -size * 0.36;
    visual.timerBadge.clear();
    visual.timerBadge.fillStyle(this.#options.theme.timerBackground, 1);
    visual.timerBadge.fillCircle(badgeX, badgeY, badgeRadius);
    visual.timer.setPosition(badgeX, badgeY);
    visual.timer.setFontSize(Math.round(badgeRadius * 1.1));
  }

  #drawBoard(): void {
    const { x, y, side, cell } = this.#geometry;
    const targets = new Map<string, number>();
    for (const passenger of this.#state.passengers) {
      if (passenger.status !== 'waiting') continue;
      const target = targetCell(passenger.target);
      targets.set(`${String(target.row)}:${String(target.col)}`, this.#options.theme.colors[passenger.color].fill);
    }

    this.#grid.clear();
    this.#grid.fillStyle(this.#options.theme.board, 1);
    this.#grid.fillRoundedRect(x - 6, y - 6, side + 12, side + 12, 22);
    for (let row = 0; row < 5; row += 1) {
      for (let col = 0; col < 5; col += 1) {
        const cellX = x + col * cell + 2;
        const cellY = y + row * cell + 2;
        const cellSize = cell - 4;
        const radius = Math.max(5, cell * 0.12);
        this.#grid.fillStyle(this.#options.theme.cell, 1);
        this.#grid.fillRoundedRect(cellX, cellY, cellSize, cellSize, radius);
        const targetColor = targets.get(`${String(row)}:${String(col)}`);
        if (targetColor !== undefined) {
          this.#grid.fillStyle(targetColor, 0.22);
          this.#grid.fillRoundedRect(cellX, cellY, cellSize, cellSize, radius);
          this.#grid.lineStyle(Math.max(2, cell * 0.055), targetColor, 0.95);
          this.#grid.strokeRoundedRect(cellX + 1, cellY + 1, cellSize - 2, cellSize - 2, radius);
        }
      }
    }
  }

  #layout(width: number, height: number): void {
    this.#geometry = boardGeometry(width, height);
    this.#drawBoard();

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
    const offset = this.#geometry.cell * 0.82;
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
      this.#drawPassenger(visual, passenger);
      visual.container.setScale(1);
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
    const taxiBeforeMove = this.#state.taxis.find((taxi) => taxi.id === action.taxiId);
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

    this.#taxiOrientations.set(
      action.taxiId,
      action.direction === 'left' || action.direction === 'right' ? 'side' : 'front',
    );
    if (visual !== undefined && taxiBeforeMove !== undefined) this.#drawTaxi(visual, taxiBeforeMove);

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
      this.#taxiOrientations.set(
        pickup.taxiId,
        passengerDefinition.target.side === 'left' || passengerDefinition.target.side === 'right'
          ? 'side'
          : 'front',
      );
      const pickupTaxi = taxiBeforeMove?.id === pickup.taxiId
        ? taxiBeforeMove
        : this.#options.level.taxis.find((taxi) => taxi.id === pickup.taxiId);
      if (pickupTaxi !== undefined) this.#drawTaxi(taxiVisual, pickupTaxi);
      this.#drawPassenger(passengerVisual, passengerDefinition);
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
    this.#drawBoard();
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
