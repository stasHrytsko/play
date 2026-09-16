/**
 * The single source of truth about *this* game.
 *
 * `npm run new-game` (see scripts/new-game.ts — being redefined for the
 * games/<slug> layout as part of the /new-game skill) rewrites this file.
 * The values below are a working stub ("Tap Targets"), not shipping content:
 * this folder exists to prove the shared shell + multi-page build work, the
 * same role the placeholder mechanic played in the original template.
 */
import type { GameDefinition } from '../../src/game-definition.ts';

export const GAME: GameDefinition = {
  id: 'tap-targets',
  title: 'Tap Targets',
  tagline: 'Заглушка механики: собери все круги',
  version: 1,

  levelCount: 5,

  onboarding: {
    version: 1,
    title: 'Как играть',
    rules: [
      'Нажимай на круги на поле',
      'Собери все круги, чтобы пройти уровень',
      'С каждым уровнем кругов больше',
      'Уровни открываются по порядку',
    ],
  },

  analytics: {
    // Project API key — public by design, see PostHogSignalSink.ts.
    postHogProjectToken: 'phc_uT9HfgYBxEeHxK2FP9LFJY5ct5ZBtPFD2znLAxPCRFDL',
    postHogHost: 'https://eu.i.posthog.com',
  },

  feedback: {
    // TODO: replace once a Web3Forms account exists (docs/decisions.md, 2026-09-16).
    web3formsAccessKey: 'REPLACE_ME_WITH_WEB3FORMS_ACCESS_KEY',
  },
};
