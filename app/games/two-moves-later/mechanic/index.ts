import Phaser from 'phaser';
import type { CreateLevelParams, LevelSession, MechanicHost } from '../../../src/shell-contract.ts';
import { setDisabled, uiButton, uiEl } from '../../../src/ui-kit/index.ts';
import type { LevelState } from './engine/types.ts';
import { getLevel } from './levels/loadLevels.ts';
import { LevelScene } from './render/LevelScene.ts';
import { readTheme } from './render/theme.ts';

// 24×24 stroke icons; the button's own label stays for screen readers.
const ICONS = {
  levels:
    '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/>' +
    '<rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
  undo: '<path d="M9 7 4.5 11.5 9 16"/><path d="M5 11.5h9a5 5 0 0 1 0 10h-2"/>',
  restart: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4v5h-5"/>',
  passenger: '<circle cx="12" cy="7" r="3.2"/><path d="M5.5 20.5a6.5 6.5 0 0 1 13 0"/>',
} as const;

function icon(name: keyof typeof ICONS): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICONS[name];
  return svg;
}

function toolButton(
  name: 'levels' | 'undo' | 'restart',
  label: string,
  testId: string,
  onClick: () => void,
): HTMLButtonElement {
  const button = uiButton({ label, variant: 'secondary', compact: true, testId, onClick });
  button.classList.add('two-moves-later-tool');
  button.setAttribute('aria-label', label);
  button.prepend(icon(name));
  return button;
}

export function createMechanicHost(): MechanicHost {
  return {
    createLevel(params: CreateLevelParams): LevelSession {
      const level = getLevel(params.levelIndex);
      // The canvas palette is hard-coded from the §7.1 mockup; the class only
      // scopes the surface background and touch handling in two-moves-later.css.
      const theme = readTheme();

      const layout = uiEl('div', { className: 'two-moves-later-layout' });
      let scene: LevelScene | null = null;
      const undo = toolButton('undo', 'Отменить ход', 'undo-move', () => scene?.undo());
      const restart = toolButton('restart', 'Начать уровень заново', 'restart-level', () => scene?.restart());
      const leftValue = uiEl('strong', { className: 'two-moves-later-left__value' });
      const left = uiEl('div', { className: 'two-moves-later-left', testId: 'passengers-left' }, [
        icon('passenger'),
        leftValue,
      ]);
      const hud = uiEl('div', { className: 'two-moves-later-hud', testId: 'mechanic-hud' }, [
        uiEl('div', { className: 'two-moves-later-tools' }, [
          toolButton('levels', 'К уровням', 'mechanic-exit', params.onExit),
          undo,
          restart,
        ]),
        left,
      ]);
      const board = uiEl('div', {
        className: 'two-moves-later-board',
        testId: 'taxi-board',
      });
      layout.append(hud, board);
      params.container.append(layout);

      const onStateChange = (state: LevelState, canUndo: boolean): void => {
        const waiting = state.passengers.filter((passenger) => passenger.status === 'waiting');
        const passengersLeft = state.passengers.length - state.served;
        leftValue.textContent = String(passengersLeft);
        left.setAttribute('aria-label', `Осталось пассажиров: ${String(passengersLeft)}`);
        setDisabled(undo, !canUndo);
        setDisabled(restart, state.status !== 'playing' || state.moves === 0);
        hud.dataset['passengersLeft'] = String(passengersLeft);
        hud.dataset['remaining'] = String(state.taxis.length);
        hud.dataset['served'] = String(state.served);
        hud.dataset['moves'] = String(state.moves);
        hud.dataset['waiting'] = String(waiting.length);
        hud.dataset['status'] = state.status;
      };

      // Render at device resolution so the tiles stay crisp on phones; the
      // canvas is scaled back down to the board box by CSS.
      const pixelRatio = Math.min(Math.max(window.devicePixelRatio || 1, 1), 3);
      const levelScene = new LevelScene({
        pixelRatio,
        level,
        theme,
        onFirstAction: params.onFirstAction,
        onComplete: params.onComplete,
        onFail: params.onFail,
        onStateChange,
      });

      scene = levelScene;
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
        scene: [levelScene],
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
