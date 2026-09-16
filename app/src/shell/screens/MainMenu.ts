import type { GameDefinition } from '../../game-definition.ts';
import { uiButton, uiEl } from '../../ui-kit/index.ts';
import { staticScreen, type Screen } from '../Screen.ts';

export interface MainMenuHandlers {
  onPlay: () => void;
  onShowRules: () => void;
}

export function MainMenu(game: GameDefinition, handlers: MainMenuHandlers): Screen {
  const screen = uiEl('section', { className: 'screen', testId: 'main-menu' }, [
    uiEl('div', {}, [
      uiEl('h1', { className: 'title', text: game.title, testId: 'game-title' }),
      uiEl('p', { className: 'tagline', text: game.tagline }),
    ]),
    uiEl('div', { className: 'screen__spacer' }),
    uiEl('div', { className: 'popup__actions' }, [
      uiButton({ label: 'Выбрать уровень', variant: 'primary', block: true, testId: 'play', onClick: handlers.onPlay }),
      uiButton({ label: 'Как играть', variant: 'ghost', block: true, testId: 'show-rules', onClick: handlers.onShowRules }),
    ]),
  ]);

  return staticScreen(screen);
}
