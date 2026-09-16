import type { GameDefinition } from '../../game-definition.ts';
import { uiButton, uiEl } from '../../ui-kit/index.ts';
import {
  isLevelCompleted,
  isLevelUnlocked,
  type ProgressState,
} from '../progress/ProgressRepository.ts';
import { staticScreen, type Screen } from '../Screen.ts';

export interface LevelSelectHandlers {
  onSelect: (levelIndex: number) => void;
  onBack: () => void;
}

/**
 * A single vertical list of `game.levelCount` (always 5) cells.
 *
 * The original template grouped levels into an easy/medium/hard 3x3 grid with
 * a colour legend (difficulty.ts). Dropped once the count settled on a fixed
 * 5 (docs/decisions.md, 2026-09-16): banding five items into three groups
 * added a UI element without adding information — a vertical strip of five
 * says the same thing at a glance.
 */
export function LevelSelect(
  game: GameDefinition,
  progress: ProgressState,
  handlers: LevelSelectHandlers,
): Screen {
  const cells: HTMLElement[] = [];

  for (let index = 0; index < game.levelCount; index += 1) {
    const unlocked = isLevelUnlocked(progress, index);
    const completed = isLevelCompleted(progress, index);
    const state = completed ? 'completed' : unlocked ? 'unlocked' : 'locked';

    const cell = uiEl(
      'button',
      {
        className: 'level-cell',
        testId: `level-${String(index + 1)}`,
        attrs: {
          type: 'button',
          'data-state': state,
          'aria-label': `Уровень ${String(index + 1)}, ${
            completed ? 'пройден' : unlocked ? 'доступен' : 'закрыт'
          }`,
        },
      },
      [
        uiEl('span', { text: unlocked ? String(index + 1) : '🔒' }),
        completed ? uiEl('span', { className: 'level-cell__badge', text: '✓' }) : null,
      ],
    );

    if (unlocked) {
      cell.addEventListener('click', () => {
        handlers.onSelect(index);
      });
    } else {
      cell.disabled = true;
    }

    cells.push(cell);
  }

  const screen = uiEl('section', { className: 'screen', testId: 'level-select' }, [
    uiEl('h2', { className: 'section-title', text: 'Выбери уровень' }),
    uiEl('div', { className: 'level-list' }, cells),
    uiEl('div', { className: 'screen__spacer' }),
    uiButton({ label: '← Назад', variant: 'ghost', block: true, testId: 'levels-back', onClick: handlers.onBack }),
  ]);

  return staticScreen(screen);
}
