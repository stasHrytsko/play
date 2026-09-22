import Phaser from 'phaser';
import type { CreateLevelParams, LevelSession, MechanicHost } from '../../../src/shell-contract.ts';
import { uiEl } from '../../../src/ui-kit/index.ts';
import type { LevelState } from './engine/types.ts';
import { getLevel } from './levels/loadLevels.ts';
import { LevelScene } from './render/LevelScene.ts';
import { readTheme } from './render/theme.ts';

export function createMechanicHost(): MechanicHost {
  return {
    createLevel(params: CreateLevelParams): LevelSession {
      const level = getLevel(params.levelIndex);
      // The canvas palette is hard-coded from the §7.1 mockup; the class only
      // scopes the surface background and touch handling in two-moves-later.css.
      const theme = readTheme();

      const layout = uiEl('div', { className: 'two-moves-later-layout' });
      const hud = uiEl('div', {
        className: 'two-moves-later-hud',
        testId: 'mechanic-hud',
      });
      const board = uiEl('div', {
        className: 'two-moves-later-board',
        testId: 'taxi-board',
      });
      layout.append(hud, board);
      params.container.append(layout);

      const onStateChange = (state: LevelState): void => {
        const waiting = state.passengers.filter((passenger) => passenger.status === 'waiting');
        hud.dataset['remaining'] = String(state.taxis.length);
        hud.dataset['served'] = String(state.served);
        hud.dataset['moves'] = String(state.moves);
        hud.dataset['waiting'] = String(waiting.length);
        hud.dataset['status'] = state.status;
      };

      // Render at device resolution so the tiles stay crisp on phones; the
      // canvas is scaled back down to the board box by CSS.
      const pixelRatio = Math.min(Math.max(window.devicePixelRatio || 1, 1), 3);
      const scene = new LevelScene({
        pixelRatio,
        level,
        theme,
        onFirstAction: params.onFirstAction,
        onComplete: params.onComplete,
        onFail: params.onFail,
        onStateChange,
      });

      const game = new Phaser.Game({
        type: Phaser.CANVAS,
        parent: board,
        backgroundColor: theme.background,
        audio: { noAudio: true },
        scale: {
          mode: Phaser.Scale.NONE,
          width: Math.max(1, board.clientWidth) * pixelRatio,
          height: Math.max(1, board.clientHeight) * pixelRatio,
        },
        scene: [scene],
      });

      const observer = new ResizeObserver(() => {
        const { width, height } = board.getBoundingClientRect();
        if (width > 0 && height > 0) game.scale.resize(width * pixelRatio, height * pixelRatio);
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
