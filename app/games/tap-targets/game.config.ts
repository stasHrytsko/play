/**
 * The single source of truth about *this* game.
 *
 * Tap Targets doubles as the smallest playable reference implementation for
 * the shared shell, render-kit and UI kit. Keep the mechanic intentionally
 * simple: the point of this folder is to prove the common game foundation in
 * a real, tappable level before the 30/30 concepts start using it.
 */
import type { GameDefinition } from '../../src/game-definition.ts';

export const GAME: GameDefinition = {
  id: 'tap-targets',
  title: 'Tap Targets',
  tagline: 'Очисти поле одним касанием',
  version: 2,

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
