import Phaser from 'phaser';
import type { CreateLevelParams, LevelSession, MechanicHost } from '../../../src/shell-contract.ts';
import type { QueueItem } from '../../../src/ui-kit/index.ts';
import { blockStatePreview, counter, inventoryTray, uiEl } from '../../../src/ui-kit/index.ts';
import type { LevelState, MoveOutcome } from './engine/types.ts';
import { getLevel } from './levels/loadLevels.ts';
import { LevelScene } from './render/LevelScene.ts';
import { readTheme, styleFor, type SceneTheme } from './render/theme.ts';

/**
 * The mechanic's only export, and the only thing main.ts may import here.
 *
 * A whole Phaser.Game is created per level and destroyed with it. That costs a
 * few milliseconds on level change and buys a guarantee worth more: no state
 * leaks from one level into the next.
 *
 * The plate is canvas; the boxes, the queue preview and the pocket are DOM
 * through ui-kit. Screws fly off the bottom of the canvas and the DOM below
 * takes over — the split is deliberate, the HUD is where the queue has to be
 * readable at a glance (spec §7).
 */
function boxItem(theme: SceneTheme, color: string, id: string): QueueItem {
  const style = styleFor(theme, color);
  return { id, tone: style.tone, label: style.glyph };
}

export function createMechanicHost(): MechanicHost {
  return {
    createLevel(params: CreateLevelParams): LevelSession {
      const level = getLevel(params.levelIndex);
      const theme = readTheme();

      params.container.classList.add('box-arrives-surface');

      const layout = uiEl('div', { className: 'box-arrives-layout' });
      const hud = uiEl('div', { className: 'box-arrives-hud', testId: 'mechanic-hud' });
      const board = uiEl('div', { className: 'box-arrives-board', testId: 'box-arrives-board' });
      const dock = uiEl('div', { className: 'box-arrives-dock' });

      layout.append(hud, board, dock);
      params.container.append(layout);

      const onStateChange = (state: LevelState, outcome: MoveOutcome | null): void => {
        hud.replaceChildren(
          uiEl('div', { className: 'box-arrives-hud__stats' }, [
            counter({
              label: 'Осталось',
              value: state.remainingScrews.length,
              icon: '◎',
              testId: 'screws-left',
            }),
            counter({
              label: 'Смена через',
              value: state.movesUntilShift,
              icon: '⟳',
              tone: state.movesUntilShift === 1 ? 'warning' : 'default',
              testId: 'until-shift',
            }),
          ]),
        );
        hud.dataset['remaining'] = String(state.remainingScrews.length);
        hud.dataset['pocket'] = String(state.pocket.length);
        hud.dataset['untilShift'] = String(state.movesUntilShift);
        hud.dataset['active'] = state.activeBoxes.join(',');
        // The shift is the payoff beat (§7); e2e and the CSS pulse both need
        // to know it just happened, and a state diff would not say so.
        hud.dataset['shifted'] = outcome?.shifted === true ? 'yes' : 'no';

        dock.replaceChildren(
          uiEl('div', { className: 'box-arrives-dock__row' }, [
            uiEl('span', { className: 'box-arrives-dock__caption', text: 'Ящики' }),
            uiEl('div', { className: 'box-arrives-dock__active', testId: 'active-boxes' }, [
              blockStatePreview(
                state.activeBoxes.map((color, index) => boxItem(theme, color, `active-${String(index)}`)),
              ),
            ]),
          ]),
          uiEl('div', { className: 'box-arrives-dock__row box-arrives-dock__row--muted' }, [
            uiEl('span', { className: 'box-arrives-dock__caption', text: 'Дальше' }),
            uiEl('div', { className: 'box-arrives-dock__queue', testId: 'box-queue' }, [
              blockStatePreview(
                state.boxQueue
                  .slice(0, level.queuePreview)
                  .map((color, index) => boxItem(theme, color, `queued-${String(index)}`)),
              ),
            ]),
          ]),
          uiEl('div', { className: 'box-arrives-dock__row' }, [
            uiEl('span', { className: 'box-arrives-dock__caption', text: 'Карман' }),
            inventoryTray({
              testId: 'pocket',
              slots: Array.from({ length: level.pocketSize }, (_, index) => {
                const slot = state.pocket[index];
                return slot === undefined
                  ? { id: `pocket-${String(index)}` }
                  : { id: `pocket-${String(index)}`, item: boxItem(theme, slot.color, slot.screwId) };
              }),
            }),
          ]),
        );
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
        // No sound in this mechanic; it also keeps headless CI quiet.
        audio: { noAudio: true },
        scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
        scene: [scene],
      });

      // Phaser's RESIZE mode measures the parent once at boot and then only
      // listens to the window. The plate is not that stable: the dock below it
      // is empty until the first render, so the board is ~200px taller at boot
      // than it is a frame later, and the canvas kept the taller size — the
      // bottom row of screws was drawn below the visible plate. Watching the
      // box itself is the fix; window resize is the case that already worked.
      const plateObserver = new ResizeObserver(() => {
        const { width, height } = board.getBoundingClientRect();
        if (width > 0 && height > 0) game.scale.resize(width, height);
      });
      plateObserver.observe(board);

      // params.onExit is for mechanics that own an exit affordance inside the
      // canvas. This one does not — the shell header has the back button.

      let destroyed = false;
      return {
        destroy(): void {
          if (destroyed) return;
          destroyed = true;
          plateObserver.disconnect();
          layout.remove();
          game.destroy(true);
        },
      };
    },
  };
}

