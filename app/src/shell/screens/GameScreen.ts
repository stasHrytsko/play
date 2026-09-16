import { uiButton, uiEl } from '../../ui-kit/index.ts';
import type { Screen } from '../Screen.ts';

export interface GameScreenHandlers {
  onBack: () => void;
}

export interface GameScreen extends Screen {
  /** The element handed to the mechanic. The shell never draws inside it. */
  readonly surface: HTMLElement;
  setStats(text: string): void;
  showOverlay(overlay: HTMLElement): void;
  hideOverlay(): void;
}

export function GameScreen(levelIndex: number, handlers: GameScreenHandlers): GameScreen {
  const stats = uiEl('span', { className: 'game-header__stats', testId: 'game-stats' });
  const surface = uiEl('div', { className: 'game-surface', testId: 'game-surface' });

  const element = uiEl('section', { className: 'screen screen--game', testId: 'game-screen' }, [
    uiEl('header', { className: 'game-header' }, [
      uiButton({
        label: `← УР. ${String(levelIndex + 1)}`,
        variant: 'ghost',
        // Same intent as the old .game-header__back CSS (removed): a smaller
        // button so it doesn't compete with the level counter next to it.
        // ui-kit's own compact modifier covers it now.
        compact: true,
        testId: 'game-back',
        onClick: handlers.onBack,
      }),
      stats,
    ]),
    surface,
  ]);

  let overlay: HTMLElement | null = null;

  return {
    element,
    surface,
    setStats(text: string): void {
      stats.textContent = text;
    },
    showOverlay(next: HTMLElement): void {
      overlay?.remove();
      overlay = next;
      element.append(next);
    },
    hideOverlay(): void {
      overlay?.remove();
      overlay = null;
    },
    destroy(): void {
      overlay?.remove();
      overlay = null;
    },
  };
}
