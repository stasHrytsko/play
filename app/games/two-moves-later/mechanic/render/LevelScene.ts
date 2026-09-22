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
  readonly hitArea: Phaser.Geom.Rectangle;
}

interface PassengerVisual {
  /** The disc outside the board edge. */
  readonly container: Phaser.GameObjects.Container;
  readonly body: Phaser.GameObjects.Graphics;
  readonly timer: Phaser.GameObjects.Text;
  /** The small patience badge in the corner of the pickup cell. */
  readonly badge: Phaser.GameObjects.Container;
  readonly badgeBody: Phaser.GameObjects.Graphics;
  readonly badgeTimer: Phaser.GameObjects.Text;
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
  readonly onStateChange: (state: LevelState, canUndo: boolean) => void;
  /** Canvas pixels per CSS pixel; the scene lays out in CSS pixels. */
  readonly pixelRatio: number;
}

export class LevelScene extends Phaser.Scene {
  readonly #options: LevelSceneOptions;
  #grid!: Phaser.GameObjects.Graphics;
  readonly #taxis = new Map<string, TaxiVisual>();
  readonly #passengers = new Map<string, PassengerVisual>();

  #state: LevelState;
  /** States before each valid swipe, newest last — the undo stack. */
  #history: LevelState[] = [];
  #geometry: BoardGeometry = { x: 0, y: 0, side: 0, cell: 0 };
  #gesture: Gesture | null = null;
  #busy = false;
  #over = false;
  #firstActionReported = false;

  #handleResize = (size: Phaser.Structs.Size): void => {
    this.cameras.resize(size.width, size.height);
    this.#layout(size.width / this.#options.pixelRatio, size.height / this.#options.pixelRatio);
  };

  constructor(options: LevelSceneOptions) {
    super({ key: 'taxi-slide-level' });
    this.#options = options;
    this.#state = createState(options.level);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(this.#options.theme.background);
    this.cameras.main.setOrigin(0, 0).setZoom(this.#options.pixelRatio);
    this.#grid = this.add.graphics();

    for (const taxi of this.#state.taxis) this.#createTaxi(taxi);
    this.#syncPassengers();

    this.input.on(Phaser.Input.Events.POINTER_UP, (pointer: Phaser.Input.Pointer) => {
      void this.#finishGesture(pointer);
    });
    this.scale.on(Phaser.Scale.Events.RESIZE, this.#handleResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.#handleResize);
      this.input.off(Phaser.Input.Events.POINTER_UP);
    });

    this.#layout(this.scale.width / this.#options.pixelRatio, this.scale.height / this.#options.pixelRatio);
    this.#report();
  }

  /** Steps back one valid swipe, patience included. */
  undo(): void {
    const previous = this.#history.pop();
    if (previous === undefined || this.#busy || this.#over) {
      if (previous !== undefined) this.#history.push(previous);
      return;
    }
    this.#rebuild(previous);
  }

  /** Back to the level's opening layout, without leaving the screen. */
  restart(): void {
    if (this.#busy || this.#over) return;
    this.#history = [];
    this.#rebuild(createState(this.#options.level));
  }

  /** The passenger who ran out of patience turns red at its cell and walks off. */
  async #showTimeout(): Promise<void> {
    const gone = this.#state.passengers.filter((passenger) => passenger.status === 'left');
    const danger = this.#options.theme.danger;
    await Promise.all(
      gone.map(async (passenger) => {
        const visual = this.#createPassenger(passenger);
        this.#drawPassenger(visual, passenger, 'gone');
        visual.timer.setText('0');
        visual.badgeTimer.setText('0');
        const point = this.#passengerPoint(passenger);
        visual.container.setPosition(point.x, point.y);
        const badge = this.#badgePoint(passenger);
        visual.badge.setPosition(badge.x, badge.y);
        const cell = targetCell(passenger.target);
        const { cell: size } = this.#geometry;
        const center = this.#cellPoint(cell.row, cell.col);
        const stroke = Math.max(3, size * 0.05);
        this.#grid.lineStyle(stroke, danger, 1);
        this.#grid.strokeRect(center.x - size / 2 + stroke / 2, center.y - size / 2 + stroke / 2, size - stroke, size - stroke);
        await punch(visual.container, { scale: 1.2, duration: 200 });
        await fadeCollapse(visual.container, { duration: 260 });
      }),
    );
  }

  #report(): void {
    this.#options.onStateChange(this.#state, this.#history.length > 0 && !this.#over);
  }

  #rebuild(state: LevelState): void {
    this.#state = state;
    this.#gesture = null;
    for (const visual of this.#taxis.values()) visual.container.destroy();
    this.#taxis.clear();
    for (const visual of this.#passengers.values()) {
      visual.container.destroy();
      visual.badge.destroy();
    }
    this.#passengers.clear();
    for (const taxi of state.taxis) this.#createTaxi(taxi);
    this.#layout(this.scale.width / this.#options.pixelRatio, this.scale.height / this.#options.pixelRatio);
    this.#report();
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
        this.#gesture = { taxiId: taxi.id, x: pointer.worldX, y: pointer.worldY };
        void punch(container, { scale: 1.06, duration: 100 });
      },
    );
    this.#taxis.set(taxi.id, { container, body, hitArea });
  }

  #createPassenger(passenger: PassengerDefinition): PassengerVisual {
    const text = (): Phaser.GameObjects.Text => {
      const label = this.add.text(0, 0, String(passenger.initialPatience), {
        fontFamily: 'system-ui, sans-serif',
        color: this.#options.theme.badgeText,
        fontStyle: '800',
      });
      label.setOrigin(0.5);
      label.setResolution(this.#options.pixelRatio);
      return label;
    };
    const body = this.add.graphics();
    const timer = text();
    const container = this.add.container(0, 0, [body, timer]);
    container.setDepth(4);
    const badgeBody = this.add.graphics();
    const badgeTimer = text();
    const badge = this.add.container(0, 0, [badgeBody, badgeTimer]);
    badge.setDepth(3);
    const visual = { container, body, timer, badge, badgeBody, badgeTimer };
    this.#passengers.set(passenger.id, visual);
    return visual;
  }

  #drawTaxi(visual: TaxiVisual, taxi: Taxi): void {
    const { cell } = this.#geometry;
    const size = cell * 0.47;
    const half = size / 2;
    const radius = size * 0.24;
    const depth = Math.max(2, size * 0.07);
    const color = this.#options.theme.colors[taxi.color];
    const g = visual.body;
    g.clear();

    // Soft drop shadow, darker bottom edge, face, then the white roof sign.
    g.fillStyle(this.#options.theme.shadow, 0.1);
    g.fillRoundedRect(-half, -half + depth * 2, size, size, radius);
    g.fillStyle(color.edge, 1);
    g.fillRoundedRect(-half, -half + depth, size, size, radius);
    g.fillStyle(color.fill, 1);
    g.fillRoundedRect(-half, -half, size, size, radius);

    const pillWidth = size * 0.4;
    const pillHeight = size * 0.14;
    g.fillStyle(this.#options.theme.pill, 0.78);
    g.fillRoundedRect(-pillWidth / 2, -pillHeight / 2, pillWidth, pillHeight, pillHeight / 2);

    // The whole cell is the swipe target, not only the painted tile.
    visual.hitArea.setTo(-cell / 2, -cell / 2, cell, cell);
  }

  #drawPassenger(
    visual: PassengerVisual,
    passenger: PassengerDefinition,
    mood: 'calm' | 'urgent' | 'gone' = 'calm',
  ): void {
    const { cell } = this.#geometry;
    const theme = this.#options.theme;
    const color = mood === 'gone' ? theme.danger : theme.colors[passenger.color].fill;
    const ringColor = mood === 'calm' ? theme.badgeRing : theme.danger;

    const radius = Math.max(13, cell * 0.17);
    const ring = Math.max(2, radius * 0.18);
    visual.body.clear();
    visual.body.fillStyle(this.#options.theme.shadow, 0.14);
    visual.body.fillCircle(0, ring, radius + ring);
    visual.body.fillStyle(ringColor, 1);
    visual.body.fillCircle(0, 0, radius + ring * (mood === 'calm' ? 1 : 1.6));
    visual.body.fillStyle(color, 1);
    visual.body.fillCircle(0, 0, radius);
    visual.timer.setFontSize(Math.round(radius * 0.95));

    const badgeRadius = Math.max(7, cell * 0.08);
    visual.badgeBody.clear();
    visual.badgeBody.fillStyle(ringColor, 1);
    visual.badgeBody.fillCircle(0, 0, badgeRadius + 1.5);
    visual.badgeBody.fillStyle(color, 1);
    visual.badgeBody.fillCircle(0, 0, badgeRadius);
    visual.badgeTimer.setFontSize(Math.round(badgeRadius * 1.15));
  }

  #drawBoard(): void {
    const { x, y, side, cell } = this.#geometry;
    const theme = this.#options.theme;
    const targets = new Map<string, number>();
    for (const passenger of this.#state.passengers) {
      if (passenger.status !== 'waiting') continue;
      const target = targetCell(passenger.target);
      targets.set(`${String(target.row)}:${String(target.col)}`, theme.colors[passenger.color].fill);
    }
    const occupied = new Set(this.#state.taxis.map((taxi) => `${String(taxi.row)}:${String(taxi.col)}`));

    const frame = Math.max(4, cell * 0.07);
    const line = Math.max(1, cell * 0.018);
    const g = this.#grid;
    g.clear();

    g.fillStyle(theme.shadow, 0.06);
    g.fillRoundedRect(x - frame, y - frame + frame * 1.2, side + frame * 2, side + frame * 2, frame * 2.4);
    g.fillStyle(theme.frame, 1);
    g.fillRoundedRect(x - frame, y - frame, side + frame * 2, side + frame * 2, frame * 2.4);
    g.fillStyle(theme.gridLine, 1);
    g.fillRoundedRect(x, y, side, side, frame * 1.2);

    for (let row = 0; row < 5; row += 1) {
      for (let col = 0; col < 5; col += 1) {
        const key = `${String(row)}:${String(col)}`;
        const cellX = x + col * cell + line / 2;
        const cellY = y + row * cell + line / 2;
        const cellSize = cell - line;
        const empty = !occupied.has(key);
        g.fillStyle(empty ? theme.empty : theme.cell, 1);
        g.fillRect(cellX, cellY, cellSize, cellSize);
        if (empty) {
          g.fillStyle(theme.emptyDot, 1);
          g.fillCircle(cellX + cellSize / 2, cellY + cellSize / 2, Math.max(2.5, cell * 0.045));
        }
        const targetColor = targets.get(key);
        if (targetColor !== undefined) {
          const stroke = Math.max(2, cell * 0.025);
          g.lineStyle(stroke, targetColor, 1);
          g.strokeRect(cellX + stroke / 2, cellY + stroke / 2, cellSize - stroke, cellSize - stroke);
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
    const offset = this.#geometry.cell * 0.5;
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

  #badgePoint(passenger: PassengerDefinition): { x: number; y: number } {
    const cell = targetCell(passenger.target);
    const center = this.#cellPoint(cell.row, cell.col);
    const inset = this.#geometry.cell * 0.36;
    return { x: center.x + inset, y: center.y - inset };
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
        visual.badge.destroy();
        this.#passengers.delete(id);
      }
    }
    for (const passenger of this.#state.passengers) {
      if (passenger.status !== 'waiting') continue;
      const visual = this.#passengers.get(passenger.id) ?? this.#createPassenger(passenger);
      this.#drawPassenger(visual, passenger, passenger.patience <= 1 ? 'urgent' : 'calm');
      visual.container.setScale(1);
      const point = this.#passengerPoint(passenger);
      visual.container.setPosition(point.x, point.y);
      const badge = this.#badgePoint(passenger);
      visual.badge.setPosition(badge.x, badge.y);
      visual.timer.setText(String(passenger.patience));
      visual.badgeTimer.setText(String(passenger.patience));
    }
  }

  async #finishGesture(pointer: Phaser.Input.Pointer): Promise<void> {
    const gesture = this.#gesture;
    this.#gesture = null;
    if (gesture === null || this.#busy || this.#over) return;
    const dx = pointer.worldX - gesture.x;
    const dy = pointer.worldY - gesture.y;
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

    this.#history.push(this.#state);
    this.#state = outcome.state;
    if (this.#state.status !== 'playing') this.#over = true;
    this.#report();
    this.#drawBoard();

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
        fadeCollapse(passengerVisual.badge, { duration: 130 }),
      ]);
      this.#taxis.delete(pickup.taxiId);
      this.#passengers.delete(pickup.passengerId);
    }

    this.#syncPassengers();
    this.#drawBoard();
    this.#busy = false;

    if (this.#state.status === 'playing') {
      // A passenger on their last swipe pulses so the danger reads without text.
      for (const passenger of this.#state.passengers) {
        if (passenger.status !== 'waiting' || passenger.patience > 1) continue;
        const urgent = this.#passengers.get(passenger.id);
        if (urgent !== undefined) {
          void punch(urgent.container, { scale: 1.18, duration: 160 });
          void punch(urgent.badge, { scale: 1.25, duration: 160 });
        }
      }
    }

    if (this.#state.status === 'failed') {
      await this.#showTimeout();
      await cameraShake(this, { duration: 220, intensity: 0.012 });
      this.#options.onFail(this.#state.failReason ?? 'passenger_timeout');
      return;
    }
    if (this.#state.status === 'won') {
      // The taxis still standing hop once in a wave: the level is done.
      await Promise.all(
        [...this.#taxis.values()].map(
          (visual, index) =>
            new Promise<void>((resolve) => {
              this.time.delayedCall(index * 25, () => {
                void punch(visual.container, { scale: 1.15, duration: 180 }).then(resolve);
              });
            }),
        ),
      );
      this.time.delayedCall(150, this.#options.onComplete);
    }
  }
}
