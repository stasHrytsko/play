import type { GameDefinition } from '../../game-definition.ts';
import { uiButton, uiEl } from '../../ui-kit/index.ts';
import { staticScreen, type Screen } from '../Screen.ts';

/**
 * The rules screen. It is the single place the rules are written down, and it
 * is shown automatically whenever the stored onboarding version is behind
 * GameDefinition.onboarding.version — change the rules, bump the version, and
 * every returning player is re-taught.
 */
export function Onboarding(game: GameDefinition, onContinue: () => void): Screen {
  const items = game.onboarding.rules.map((rule, index) =>
    uiEl('li', { className: 'rules__item' }, [
      uiEl('span', { className: 'rules__marker', text: String(index + 1) }),
      uiEl('span', { text: rule }),
    ]),
  );

  const screen = uiEl('section', { className: 'screen', testId: 'onboarding' }, [
    uiEl('h2', { className: 'section-title', text: game.onboarding.title }),
    uiEl('ul', { className: 'rules' }, items),
    uiEl('div', { className: 'screen__spacer' }),
    uiButton({
      label: 'Понятно, играем',
      variant: 'primary',
      block: true,
      testId: 'onboarding-continue',
      onClick: onContinue,
    }),
  ]);

  return staticScreen(screen);
}
