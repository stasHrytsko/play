/**
 * The single source of truth about *this* game.
 *
 * Box Arrives — concept 01 of the 30/30 shelf, day 1. The spec it implements
 * is ../../../specs/01-box-arrives.md; rules.md here is the copy that ships
 * with the game.
 */
import type { GameDefinition } from '../../src/game-definition.ts';

export const GAME: GameDefinition = {
  id: 'box-arrives',
  title: 'Ящик приезжает',
  tagline: 'Откручивай под тот ящик, что стоит сейчас',
  version: 1,

  levelCount: 5,

  onboarding: {
    version: 1,
    title: 'Как играть',
    rules: [
      'Нажми на винт, чтобы открутить его',
      'Подходящий цвет сразу уйдёт в один из двух ящиков',
      'Неподходящий винт попадёт в карман — там всего 3 места',
      'Каждые 3 хода приезжает новый ящик, следующие видны заранее',
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
