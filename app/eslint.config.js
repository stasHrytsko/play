// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'android/**',
      'ios/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },

  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
    },
  },

  // --- Architectural boundaries, enforced by the linter rather than by good intentions. ---

  {
    // The engine is pure: no rendering library, no DOM, no storage, no I/O.
    // Mechanic code lives per game now (games/<slug>/mechanic), not under src/
    // (docs/decisions.md, 2026-09-16 — shell is shared, mechanic is not).
    files: ['games/*/mechanic/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['phaser', 'phaser/*'], message: 'engine must stay pure — no Phaser imports.' },
            { group: ['**/render/**'], message: 'engine must not depend on rendering.' },
            { group: ['**/render-kit/**'], message: 'engine must not depend on rendering.' },
            { group: ['**/ui-kit/**'], message: 'engine must stay pure — ui-kit touches the DOM.' },
            { group: ['**/shell/**'], message: 'engine must not depend on the shell.' },
            { group: ['@capacitor/*'], message: 'engine must stay pure — no platform imports.' },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'engine must stay pure — no DOM.' },
        { name: 'document', message: 'engine must stay pure — no DOM.' },
        { name: 'localStorage', message: 'engine must stay pure — no storage.' },
        { name: 'fetch', message: 'engine must stay pure — no I/O.' },
      ],
    },
  },

  {
    // The shell knows the contract, never the game.
    files: ['src/shell/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['phaser', 'phaser/*'],
              message: 'shell is DOM-only — Phaser lives in games/*/mechanic/render and src/render-kit.',
            },
            { group: ['**/mechanic/**'], message: 'shell talks to the game only through src/shell-contract.ts.' },
            { group: ['**/render-kit/**'], message: 'shell is DOM-only — render-kit is a Phaser effects library.' },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        {
          name: 'localStorage',
          message: 'use ProgressRepository — Android WebView may clear localStorage.',
        },
      ],
    },
  },

  {
    // Shell screens must not reach the network directly; signals go through SignalSink.
    files: ['src/shell/screens/**/*.ts', 'src/shell/progress/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'use SignalSink — screens do not talk to the network.' },
        { name: 'localStorage', message: 'use ProgressRepository.' },
      ],
    },
  },

  {
    // render-kit is a Phaser effects library, not a game: no coupling to a
    // specific game's mechanic, no coupling to the shell, no platform APIs.
    // Consumed by games/*/mechanic/render/** only — nothing here restricts
    // that direction, only the reverse ones (see the engine and shell blocks
    // above, which also forbid importing render-kit).
    files: ['src/render-kit/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['**/shell/**'], message: 'render-kit must not depend on the shell.' },
            {
              group: ['**/mechanic/**'],
              message: 'render-kit must not depend on any specific game — mechanic/render imports render-kit, never the reverse.',
            },
            { group: ['**/ui-kit/**'], message: 'render-kit is Phaser-only — ui-kit is a separate, DOM-only kit.' },
            { group: ['@capacitor/*'], message: 'render-kit must stay platform-agnostic — no Capacitor imports.' },
          ],
        },
      ],
    },
  },

  {
    // ui-kit is a DOM component library, not a game: no Phaser, no coupling
    // to a specific game's mechanic, no coupling to the shell. Not consumed
    // by anything yet — see docs/decisions.md for the open question of
    // whether src/shell/** adopts it or keeps its own dom.ts/button().
    files: ['src/ui-kit/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['phaser', 'phaser/*'], message: 'ui-kit is DOM-only — no Phaser imports.' },
            { group: ['**/render-kit/**'], message: 'ui-kit is DOM-only — render-kit is a separate, Phaser-only kit.' },
            { group: ['**/shell/**'], message: 'ui-kit must not depend on the shell.' },
            {
              group: ['**/mechanic/**'],
              message: 'ui-kit must not depend on any specific game — a game imports ui-kit, never the reverse.',
            },
            { group: ['@capacitor/*'], message: 'ui-kit must stay platform-agnostic — no Capacitor imports.' },
          ],
        },
      ],
    },
  },

  {
    files: ['scripts/**/*.ts', '*.config.ts', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off' },
  },

  {
    // This file is not in tsconfig's include list, so type-aware rules have no
    // program to work from. Lint it for syntax and style only.
    files: ['eslint.config.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  {
    files: ['tests/**/*.ts', 'games/*/tests/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
    rules: { '@typescript-eslint/explicit-module-boundary-types': 'off' },
  },
);
