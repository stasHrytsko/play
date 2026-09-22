import type { GameDefinition } from '../../src/game-definition.ts';

export const GAME: GameDefinition = {
  id: 'two-moves-later',
  title: 'Такси-пятнашки',
  tagline: 'Сдвигай такси и успевай к пассажирам',
  version: 1,
  levelCount: 4,

  onboarding: {
    version: 1,
    title: 'Как играть',
    rules: [
      'Проведи такси в соседнюю пустую клетку',
      'Цвет и знак показывают, какое такси ждёт пассажир',
      'Каждый успешный свайп уменьшает терпение пассажиров',
      'Такси с пассажиром сразу уезжает и освобождает клетку',
    ],
  },

  analytics: {
    postHogProjectToken: 'phc_uT9HfgYBxEeHxK2FP9LFJY5ct5ZBtPFD2znLAxPCRFDL',
    postHogHost: 'https://eu.i.posthog.com',
  },

  feedback: {
    web3formsAccessKey: 'REPLACE_ME_WITH_WEB3FORMS_ACCESS_KEY',
  },
};
