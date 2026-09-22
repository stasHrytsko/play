import Phaser from 'phaser';
import type { CreateLevelParams, LevelSession, MechanicHost } from '../../../src/shell-contract.ts';
import { counter, uiEl } from '../../../src/ui-kit/index.ts';
import type { LevelState } from './engine/types.ts';
import { getLevel } from './levels/loadLevels.ts';
import { LevelScene } from './render/LevelScene.ts';
import { readTheme } from './render/theme.ts';

export function createMechanicHost(): MechanicHost {
  return {
    createLevel(params: CreateLevelParams): LevelSession {
      const level = getLevel(params.levelIndex);
      // Scoped to this game's own container, not document.documentElement:
      // two-moves-later.css overrides --piece-* under .two-moves-later-surface,
      // so this game's canvas gets its own palette while everything outside
      // the canvas (buttons, onboarding, rating) still reads the shared
      // tokens.css unchanged.
      params.container.classList.add('two-moves-later-surface');
      const theme = readTheme(params.container);

      const layout = uiEl('div', { className: 'two-moves-later-layout' });
      const hud = uiEl('div', {
        className: 'two-moves-later-hud',
        testId: 'mechanic-hud',
      });
      const board = uiEl('div', {
        className: 'two-moves-later-board',
        testId: 'taxi-board',
      });
      const hint = uiEl('div', {
        className: 'two-moves-later-hint',
        text: 'Проведи такси в соседнюю пустую клетку',
        testId: 'taxi-hint',
      });
      layout.append(hud, board, hint);
      params.container.append(layout);

      const onStateChange = (state: LevelState): void => {
        const waiting = state.passengers.filter((passenger) => passenger.status === 'waiting');
        const minimumPatience =
          waiting.length === 0 ? '—' : Math.min(...waiting.map((passenger) => passenger.patience));
        hud.replaceChildren(
          counter({
            label: 'Такси',
            value: state.taxis.length,
            icon: '▣',
            testId: 'taxis-left',
          }),
          counter({
            label: 'Уехали',
            value: state.served,
            icon: '✓',
            testId: 'served-count',
          }),
          counter({
            label: 'Ходы',
            value: state.moves,
            icon: '↗',
            testId: 'move-count',
          }),
          counter({
            label: 'Терпение',
            value: minimumPatience,
            icon: '◷',
            tone: minimumPatience === 1 ? 'warning' : 'default',
            testId: 'minimum-patience',
          }),
        );
        hud.dataset['remaining'] = String(state.taxis.length);
        hud.dataset['served'] = String(state.served);
        hud.dataset['moves'] = String(state.moves);
        hud.dataset['waiting'] = String(waiting.length);
        hud.dataset['status'] = state.status;
      };

      const scene = new LevelScene({
        level,
        theme,
        onFirstAction: params.onFirstAction,
        onComplete: params.onComplete,
        onFail: params.onFail,
        onStateChange,
      });

      const game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: board,
        backgroundColor: theme.background,
        audio: { noAudio: true },
        scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
        scene: [scene],
      });

      const observer = new ResizeObserver(() => {
        const { width, height } = board.getBoundingClientRect();
        if (width > 0 && height > 0) game.scale.resize(width, height);
      });
      observer.observe(board);

      let destroyed = false;
      return {
        destroy(): void {
          if (destroyed) return;
          destroyed = true;
          observer.disconnect();
          layout.remove();
          game.destroy(true);
        },
      };
    },
  };
}
