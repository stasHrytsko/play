import { beforeEach, describe, expect, it } from 'vitest';
import type { GameDefinition } from '../../src/game-definition.ts';
import type { CreateLevelParams, LevelSession, MechanicHost } from '../../src/shell-contract.ts';
import { NoopFeedbackSink } from '../../src/shell/feedback/FeedbackSink.ts';
import { ShellApp } from '../../src/shell/App.ts';
import { MemoryProgressRepository } from '../../src/shell/progress/MemoryProgressRepository.ts';
import {
  emptyProgress,
  withOnboardingSeen,
  type ProgressState,
} from '../../src/shell/progress/ProgressRepository.ts';
import { NoopSignalSink } from '../../src/shell/signal/SignalSink.ts';

const GAME: GameDefinition = {
  id: 'test-game',
  title: 'Test Game',
  tagline: 'A game used only by the shell tests',
  version: 1,
  levelCount: 3,
  onboarding: { version: 2, title: 'Как играть', rules: ['Правило один', 'Правило два'] },
  analytics: { postHogProjectToken: 'phc_test', postHogHost: 'https://eu.i.posthog.com' },
  feedback: { web3formsAccessKey: 'test-access-key' },
};

/**
 * Stands in for the real mechanic so the shell flow can be tested without a
 * renderer. This is exactly what the Shell/Mechanic split is for.
 */
class FakeMechanic implements MechanicHost {
  mounted: CreateLevelParams | null = null;
  destroyed = 0;

  createLevel(params: CreateLevelParams): LevelSession {
    this.mounted = params;
    return {
      destroy: () => {
        this.destroyed += 1;
      },
    };
  }

  firstAction(): void {
    this.mounted?.onFirstAction();
  }

  finishLevel(): void {
    this.mounted?.onComplete();
  }

  failLevel(reason = 'blocked'): void {
    this.mounted?.onFail(reason);
  }

  exitLevel(): void {
    this.mounted?.onExit();
  }
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

let root: HTMLElement;
let mechanic: FakeMechanic;
let signal: NoopSignalSink;
let feedback: NoopFeedbackSink;
let progress: MemoryProgressRepository;

function find(testId: string): HTMLElement | null {
  return root.querySelector<HTMLElement>('[data-testid="' + testId + '"]');
}

function click(testId: string): void {
  const node = find(testId);
  if (node === null) throw new Error('No element with data-testid=' + testId);
  node.click();
}

async function launch(initial: ProgressState = emptyProgress()): Promise<ShellApp> {
  progress = new MemoryProgressRepository(initial);
  const app = await ShellApp.create({ root, game: GAME, progress, signal, feedback, mechanic });
  app.start();
  return app;
}

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  root = document.querySelector<HTMLElement>('#app') as HTMLElement;
  mechanic = new FakeMechanic();
  signal = new NoopSignalSink();
  feedback = new NoopFeedbackSink();
});

describe('first launch', () => {
  it('opens on the main menu', async () => {
    await launch();
    expect(find('main-menu')).not.toBeNull();
    expect(find('game-title')?.textContent).toBe('Test Game');
  });

  it('fires game_open once, on start', async () => {
    await launch();
    expect(signal.sent.filter((s) => s.event === 'game_open')).toHaveLength(1);
  });

  it('shows the onboarding before the levels', async () => {
    await launch();
    click('play');
    expect(find('onboarding')).not.toBeNull();
    expect(root.querySelectorAll('.rules__item')).toHaveLength(2);

    click('onboarding-continue');
    await flush();
    expect(find('level-select')).not.toBeNull();
  });

  it('remembers that the onboarding was seen', async () => {
    await launch();
    click('play');
    click('onboarding-continue');
    await flush();

    expect((await progress.load()).onboardingVersion).toBe(2);
  });
});

describe('returning player', () => {
  it('skips onboarding when the stored version is current', async () => {
    await launch(withOnboardingSeen(emptyProgress(), 2));
    click('play');
    expect(find('level-select')).not.toBeNull();
  });

  it('shows onboarding again when the rules moved ahead', async () => {
    await launch(withOnboardingSeen(emptyProgress(), 1));
    click('play');
    expect(find('onboarding')).not.toBeNull();
  });

  it('can open the rules from the menu without starting a game', async () => {
    await launch(withOnboardingSeen(emptyProgress(), 2));
    click('show-rules');
    expect(find('onboarding')).not.toBeNull();

    click('onboarding-continue');
    await flush();
    expect(find('main-menu')).not.toBeNull();
  });
});

describe('level select', () => {
  it('locks every level but the first on a fresh install', async () => {
    await launch(withOnboardingSeen(emptyProgress(), 2));
    click('play');

    expect(find('level-1')?.dataset['state']).toBe('unlocked');
    expect(find('level-2')?.dataset['state']).toBe('locked');
    expect((find('level-2') as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders one cell per level, in a single list — no difficulty bands', async () => {
    await launch(withOnboardingSeen(emptyProgress(), 2));
    click('play');

    const list = root.querySelector('.level-list');
    expect(list?.querySelectorAll('.level-cell')).toHaveLength(GAME.levelCount);
    expect(find('level-1')?.dataset['band']).toBeUndefined();
  });
});

describe('playing a level', () => {
  async function startLevelOne(): Promise<ShellApp> {
    const app = await launch(withOnboardingSeen(emptyProgress(), 2));
    click('play');
    click('level-1');
    return app;
  }

  it('mounts the mechanic into the game surface', async () => {
    await startLevelOne();
    expect(find('game-screen')).not.toBeNull();
    expect(mechanic.mounted?.levelIndex).toBe(0);
    expect(mechanic.mounted?.container).toBe(find('game-surface'));
  });

  it('fires level_start when a level is entered', async () => {
    await startLevelOne();
    expect(signal.sent).toContainEqual({ event: 'level_start', gameId: 'test-game', level: 0 });
  });

  it('fires first_action once for the first meaningful mechanic action', async () => {
    await startLevelOne();
    mechanic.firstAction();
    mechanic.firstAction();

    expect(signal.sent.filter((s) => s.event === 'first_action')).toEqual([
      {
        event: 'first_action',
        gameId: 'test-game',
        level: 0,
        version: 1,
      },
    ]);
  });

  it('shows a fail popup and fires level_fail with the mechanic reason', async () => {
    await startLevelOne();
    mechanic.failLevel('pocket_overflow');

    expect(find('fail-popup')).not.toBeNull();
    expect(signal.sent).toContainEqual({
      event: 'level_fail',
      gameId: 'test-game',
      level: 0,
      reason: 'pocket_overflow',
      version: 1,
    });
    expect((await progress.load()).completedLevels).toEqual([]);
  });

  it('fires retry and remounts the same level from the fail popup', async () => {
    await startLevelOne();
    mechanic.failLevel('pocket_overflow');
    click('retry-level');

    expect(signal.sent).toContainEqual({
      event: 'retry',
      gameId: 'test-game',
      level: 0,
      version: 1,
    });
    expect(mechanic.mounted?.levelIndex).toBe(0);
  });

  it('returns to level select from the fail popup', async () => {
    await startLevelOne();
    mechanic.failLevel();
    click('fail-to-levels');

    expect(find('level-select')).not.toBeNull();
  });

  it('shows the win popup, saves progress and fires level_win on completion', async () => {
    await startLevelOne();
    mechanic.finishLevel();
    await flush();

    expect(find('win-popup')).not.toBeNull();
    expect(find('next-level')?.textContent).toBe('Уровень 2 →');
    expect((await progress.load()).completedLevels).toEqual([0]);
    expect(signal.sent).toContainEqual({
      event: 'level_win',
      gameId: 'test-game',
      level: 0,
      version: 1,
    });
  });

  it('moves on to the next level from the popup', async () => {
    await startLevelOne();
    mechanic.finishLevel();
    await flush();
    click('next-level');

    expect(mechanic.mounted?.levelIndex).toBe(1);
  });

  it('replays the same level from the popup', async () => {
    await startLevelOne();
    mechanic.finishLevel();
    await flush();
    click('replay-level');

    expect(mechanic.mounted?.levelIndex).toBe(0);
  });

  it('destroys the session when the screen changes', async () => {
    await startLevelOne();
    click('game-back');
    expect(mechanic.destroyed).toBe(1);
    expect(find('level-select')).not.toBeNull();
  });

  it('honours onExit from inside the mechanic', async () => {
    await startLevelOne();
    mechanic.exitLevel();
    expect(find('level-select')).not.toBeNull();
  });

  it('ignores mechanic events that arrive after the session was torn down', async () => {
    await startLevelOne();
    const stale = mechanic.mounted;
    click('game-back');

    stale?.onFirstAction();
    stale?.onFail('late_failure');
    stale?.onComplete();
    await flush();

    expect(find('win-popup')).toBeNull();
    expect(find('fail-popup')).toBeNull();
    expect(signal.sent.some((s) => s.event === 'first_action')).toBe(false);
    expect(signal.sent.some((s) => s.event === 'level_fail')).toBe(false);
    expect((await progress.load()).completedLevels).toEqual([]);
  });
});

describe('finishing the game', () => {
  async function finishEveryLevel(): Promise<void> {
    await launch(withOnboardingSeen(emptyProgress(), 2));
    click('play');
    click('level-1');

    for (let level = 0; level < GAME.levelCount; level += 1) {
      mechanic.finishLevel();
      await flush();
      if (level < GAME.levelCount - 1) click('next-level');
    }
  }

  it('shows the rating popup instead of the usual win popup, and fires level_5_complete', async () => {
    await finishEveryLevel();
    expect(find('rating-popup')).not.toBeNull();
    expect(find('win-popup')).toBeNull();
    expect(signal.sent).toContainEqual({ event: 'level_5_complete', gameId: 'test-game' });
  });

  it('keeps the submit button disabled until a star is picked', async () => {
    await finishEveryLevel();
    expect((find('rating-submit') as HTMLButtonElement).disabled).toBe(true);

    click('rating-star-4');
    expect((find('rating-submit') as HTMLButtonElement).disabled).toBe(false);
  });

  it('sends rating_submit with the chosen value and returns to level select', async () => {
    await finishEveryLevel();
    click('rating-star-4');
    click('rating-submit');
    await flush();

    expect(signal.sent).toContainEqual({
      event: 'rating_submit',
      gameId: 'test-game',
      rating: 4,
      version: 1,
    });
    expect((await progress.load()).ratingAsked).toBe(true);
    expect(find('level-select')).not.toBeNull();
  });

  it('sends comment_submit and emails feedback only when a comment was written', async () => {
    await finishEveryLevel();
    click('rating-star-5');
    click('rating-submit');
    await flush();

    expect(signal.sent.some((s) => s.event === 'comment_submit')).toBe(false);
    expect(feedback.sent).toEqual([]);
  });

  it('sends comment_submit and emails feedback when a comment is written', async () => {
    await finishEveryLevel();
    click('rating-star-2');
    (find('rating-comment') as HTMLTextAreaElement).value = '  Слишком сложно на 4 уровне  ';
    click('rating-submit');
    await flush();

    expect(signal.sent).toContainEqual({ event: 'comment_submit', gameId: 'test-game' });
    expect(feedback.sent).toEqual([
      { gameId: 'test-game', gameTitle: 'Test Game', comment: 'Слишком сложно на 4 уровне' },
    ]);
  });

  it('never shows the rating popup a second time', async () => {
    await finishEveryLevel();
    click('rating-star-3');
    click('rating-submit');
    await flush();

    click('level-3');
    mechanic.finishLevel();
    await flush();

    expect(find('rating-popup')).toBeNull();
    expect(find('win-popup')).not.toBeNull();
  });
});

describe('android hardware back', () => {
  it('walks back up the flow and then gives up to the OS', async () => {
    const app = await launch(withOnboardingSeen(emptyProgress(), 2));
    click('play');
    click('level-1');

    expect(app.handleBack()).toBe(true);
    expect(find('level-select')).not.toBeNull();

    expect(app.handleBack()).toBe(true);
    expect(find('main-menu')).not.toBeNull();

    expect(app.handleBack()).toBe(false);
  });

  it('returns to the menu from the rules opened on the menu', async () => {
    const app = await launch(withOnboardingSeen(emptyProgress(), 2));
    click('show-rules');
    expect(app.handleBack()).toBe(true);
    expect(find('main-menu')).not.toBeNull();
  });
});
