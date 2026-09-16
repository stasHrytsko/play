import { defineConfig } from 'vitest/config';

/**
 * Two projects, on purpose.
 *
 * The mechanic project runs in Node with no DOM at all: if a pure-rules module
 * ever reaches for `document`, the test suite fails rather than silently
 * passing under jsdom. Mechanic tests live next to their game
 * (games/<slug>/tests) rather than in a shared tests/mechanic — each game has
 * its own engine now (docs/decisions.md, 2026-09-16). tests/e2e belongs to
 * Playwright and is excluded here.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'mechanic',
          include: ['games/*/tests/**/*.test.ts'],
          environment: 'node',
          restoreMocks: true,
        },
      },
      {
        test: {
          name: 'shell',
          include: ['tests/shell/**/*.test.ts'],
          environment: 'jsdom',
          restoreMocks: true,
        },
      },
    ],
  },
});
