import Phaser from 'phaser';
import type { CreateLevelParams, LevelSession, MechanicHost } from '../../../src/shell-contract.ts';
import { counter, objectiveCard, progressBar, uiEl } from '../../../src/ui-kit/index.ts';
import type { LevelState } from './engine/types.ts';
import { getLevel } from './levels/loadLevels.ts';
import { LevelScene } from './render/LevelScene.ts';
import { readTheme } from './render/theme.ts';

/**
 * The mechanic's only export, and the only thing src/main.ts is allowed to
 * import from this folder.
 *
 * A whole Phaser.Game is created per level and destroyed with it. That costs a
 * few milliseconds on level change and buys a guarantee worth much more: no
 * state can leak from one level into the next.
 */
export function createMechanicHost(): MechanicHost {
  return {
    createLevel(params: CreateLevelParams): LevelSession {
      const level = getLevel(params.levelIndex);
      const theme = readTheme();
      const totalTargets = level.targets.length;

      params.container.classList.add('tap-targets-surface');

      const layout = uiEl('div', { className: 'tap-targets-layout' });
      const hud = uiEl('div', {
        className: 'tap-targets-hud',
        testId: 'mechanic-hud',
      });
      const board = uiEl('div', {
        className: 'tap-targets-board',
        testId: 'tap-targets-board',
      });

      layout.append(hud, board);
      params.container.append(layout);

      const onStateChange = (state: LevelState): void => {
        const cleared = totalTargets - state.remaining.length;

        hud.replaceChildren(
          objectiveCard({
            title: 'Goal',
            text: 'Clear all targets',
            icon: '◎',
            current: cleared,
            target: totalTargets,
            testId: 'tap-targets-objective',
          }),
          uiEl('div', { className: 'tap-targets-hud__stats' }, [
            counter({
              label: 'Left',
              value: state.remaining.length,
              icon: '●',
              tone: state.remaining.length <= 1 ? 'warning' : 'default',
              testId: 'targets-left',
            }),
            counter({
              label: 'Taps',
              value: state.taps,
              icon: '↗',
              testId: 'tap-count',
            }),
          ]),
          progressBar({
            value: cleared,
            max: totalTargets,
            label: 'Progress',
            testId: 'target-progress',
          }),
        );

        hud.dataset['remaining'] = String(state.remaining.length);
        hud.dataset['taps'] = String(state.taps);
      };

      const scene = new LevelScene({
        level,
        theme,
        onFirstAction: params.onFirstAction,
        onComplete: params.onComplete,
        onStateChange,
      });

      const game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: board,
        backgroundColor: theme.background,
        // No sound in the placeholder mechanic; this also keeps headless CI quiet.
        audio: { noAudio: true },
        scale: {
          mode: Phaser.Scale.RESIZE,
          width: '100%',
          height: '100%',
        },
        scene: [scene],
      });

      // params.onExit exists for mechanics that own their own exit affordance
      // (a pause menu inside the canvas). This one does not: the shell header
      // has the back button, so it is deliberately never called.

      let destroyed = false;
      return {
        destroy(): void {
          if (destroyed) return;
          destroyed = true;
          layout.remove();
          game.destroy(true);
        },
      };
    },
  };
}
