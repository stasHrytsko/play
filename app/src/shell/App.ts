import type { GameDefinition } from '../game-definition.ts';
import type { LevelSession, MechanicHost } from '../shell-contract.ts';
import type { FeedbackSink } from './feedback/FeedbackSink.ts';
import {
  allLevelsCompleted,
  needsOnboarding,
  nextLevelIndex,
  withLevelCompleted,
  withOnboardingSeen,
  withRatingAsked,
  type ProgressRepository,
  type ProgressState,
} from './progress/ProgressRepository.ts';
import type { Screen } from './Screen.ts';
import { GameScreen } from './screens/GameScreen.ts';
import { LevelSelect } from './screens/LevelSelect.ts';
import { MainMenu } from './screens/MainMenu.ts';
import { Onboarding } from './screens/Onboarding.ts';
import { Popup } from './screens/Popup.ts';
import { RatingScreen, type RatingSubmission } from './screens/RatingScreen.ts';
import type { SignalSink } from './signal/SignalSink.ts';

export interface ShellAppDeps {
  root: HTMLElement;
  game: GameDefinition;
  progress: ProgressRepository;
  signal: SignalSink;
  feedback: FeedbackSink;
  mechanic: MechanicHost;
}

type Route = 'menu' | 'rules' | 'levels' | 'game';

/**
 * The whole navigation of the application, in one readable file.
 *
 * Screens never navigate themselves and the mechanic never navigates at all —
 * it reports `onComplete` / `onExit` and this class decides what that means.
 */
export class ShellApp {
  readonly #deps: ShellAppDeps;

  #state: ProgressState;
  #screen: Screen | null = null;
  #session: LevelSession | null = null;
  #route: Route = 'menu';
  /** Where "Как играть" should return to when it was opened from the menu. */
  #rulesReturn: Route = 'menu';

  constructor(deps: ShellAppDeps, initialState: ProgressState) {
    this.#deps = deps;
    this.#state = initialState;
  }

  static async create(deps: ShellAppDeps): Promise<ShellApp> {
    const initialState = await deps.progress.load();
    return new ShellApp(deps, initialState);
  }

  start(): void {
    // Fire-and-forget: the player must never wait on analytics to see the menu.
    void this.#deps.signal.send({ event: 'game_open', gameId: this.#deps.game.id });
    this.goMenu();
  }

  get route(): Route {
    return this.#route;
  }

  // --- Navigation ---------------------------------------------------------

  goMenu(): void {
    this.#route = 'menu';
    this.#show(
      MainMenu(this.#deps.game, {
        onPlay: () => {
          this.#playPressed();
        },
        onShowRules: () => {
          this.#rulesReturn = 'menu';
          this.goRules();
        },
      }),
    );
  }

  goRules(): void {
    this.#route = 'rules';
    void this.#deps.signal.send({ event: 'help_open', gameId: this.#deps.game.id });
    this.#show(
      Onboarding(this.#deps.game, () => {
        void this.#rulesAcknowledged();
      }),
    );
  }

  goLevelSelect(): void {
    this.#route = 'levels';
    this.#show(
      LevelSelect(this.#deps.game, this.#state, {
        onSelect: (levelIndex) => {
          this.goLevel(levelIndex);
        },
        onBack: () => {
          this.goMenu();
        },
      }),
    );
  }

  goLevel(levelIndex: number): void {
    this.#route = 'game';
    void this.#deps.signal.send({ event: 'level_start', gameId: this.#deps.game.id, level: levelIndex });

    const screen = GameScreen(levelIndex, {
      onBack: () => {
        this.goLevelSelect();
      },
    });
    screen.setStats(`Уровень ${String(levelIndex + 1)} из ${String(this.#deps.game.levelCount)}`);
    this.#show(screen);

    // A session that has already been torn down must not be able to complete.
    let live = true;
    const session = this.#deps.mechanic.createLevel({
      container: screen.surface,
      levelIndex,
      onComplete: () => {
        if (!live) return;
        live = false;
        void this.#levelCompleted(levelIndex, screen);
      },
      onExit: () => {
        if (!live) return;
        live = false;
        this.goLevelSelect();
      },
    });

    this.#session = {
      destroy: () => {
        live = false;
        session.destroy();
      },
    };
  }

  /**
   * Android hardware back. Returns false when there is nothing left to go back
   * to, which main.ts translates into "let the OS close the app".
   */
  handleBack(): boolean {
    switch (this.#route) {
      case 'menu':
        return false;
      case 'rules':
        if (this.#rulesReturn === 'menu') this.goMenu();
        else this.goLevelSelect();
        return true;
      case 'levels':
        this.goMenu();
        return true;
      case 'game':
        this.goLevelSelect();
        return true;
    }
  }

  // --- Flow ---------------------------------------------------------------

  #playPressed(): void {
    if (needsOnboarding(this.#state, this.#deps.game.onboarding.version)) {
      this.#rulesReturn = 'levels';
      this.goRules();
      return;
    }
    this.goLevelSelect();
  }

  async #rulesAcknowledged(): Promise<void> {
    this.#state = withOnboardingSeen(this.#state, this.#deps.game.onboarding.version);
    await this.#deps.progress.save(this.#state);

    if (this.#rulesReturn === 'menu') this.goMenu();
    else this.goLevelSelect();
  }

  async #levelCompleted(levelIndex: number, screen: ReturnType<typeof GameScreen>): Promise<void> {
    this.#state = withLevelCompleted(this.#state, levelIndex);
    await this.#deps.progress.save(this.#state);

    const { game } = this.#deps;
    const { levelCount } = game;

    void this.#deps.signal.send({
      event: 'level_win',
      gameId: game.id,
      level: levelIndex,
      version: game.version,
    });

    const finishedEverything = allLevelsCompleted(this.#state, levelCount) && !this.#state.ratingAsked;

    if (finishedEverything) {
      // Reached regardless of whether the player goes on to submit a rating —
      // "доходимость до 5-го уровня" and "rating_submit" answer different
      // questions in 13 — Правила эксперимента 30/30 §8.
      void this.#deps.signal.send({ event: 'level_5_complete', gameId: game.id });

      screen.showOverlay(
        RatingScreen({
          onSubmit: (result) => {
            void this.#ratingSubmitted(result);
          },
        }),
      );
      return;
    }

    const next = nextLevelIndex(levelIndex, levelCount);

    screen.showOverlay(
      Popup({
        testId: 'win-popup',
        emoji: '🎉',
        title: 'Поздравляю, прошёл!',
        body: `Уровень ${String(levelIndex + 1)} из ${String(levelCount)} — ${game.title}`,
        actions: [
          ...(next === null
            ? []
            : [
                {
                  label: `Уровень ${String(next + 1)} →`,
                  variant: 'primary' as const,
                  testId: 'next-level',
                  onClick: (): void => {
                    this.goLevel(next);
                  },
                },
              ]),
          {
            label: 'Ещё раз',
            testId: 'replay-level',
            onClick: (): void => {
              this.goLevel(levelIndex);
            },
          },
          {
            label: 'К уровням',
            variant: 'ghost' as const,
            testId: 'to-levels',
            onClick: (): void => {
              this.goLevelSelect();
            },
          },
        ],
      }),
    );
  }

  /**
   * The rating popup's only exit. Fires rating_submit always; comment_submit
   * and the actual email only if the player wrote something (docs/decisions.md,
   * 2026-09-16).
   */
  async #ratingSubmitted(result: RatingSubmission): Promise<void> {
    this.#state = withRatingAsked(this.#state);
    await this.#deps.progress.save(this.#state);

    const { game } = this.#deps;

    void this.#deps.signal.send({
      event: 'rating_submit',
      gameId: game.id,
      rating: result.rating,
      version: game.version,
    });

    if (result.comment.length > 0) {
      void this.#deps.signal.send({ event: 'comment_submit', gameId: game.id });
      void this.#deps.feedback.send({
        gameId: game.id,
        gameTitle: game.title,
        comment: result.comment,
      });
    }

    this.goLevelSelect();
  }

  // --- Screen plumbing ----------------------------------------------------

  #show(screen: Screen): void {
    this.#session?.destroy();
    this.#session = null;

    this.#screen?.destroy();
    this.#screen = screen;

    this.#deps.root.replaceChildren(screen.element);
  }
}
