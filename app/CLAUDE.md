# app — shared shell, Prototype Validation Project (30/30)

Shared DOM shell + Phaser mechanic. One game per `games/<slug>/`; only
`games/<slug>/mechanic/**` changes between games.

## Architecture

- `docs/architecture.md` — the original template's design (Android-first,
  9 levels, ntfy). Read it for *why the shell is shaped the way it is*, but
  treat every concrete number/path in it as historical — `docs/decisions.md`
  D-011 is the current source of truth for what actually changed and why.
- `docs/decisions.md` — decisions taken while building, with their trade-offs.
  Read D-011 first; it is the fork's own entry.
- `src/shell-contract.ts` — the Shell ↔ Mechanic boundary.
- `src/game-definition.ts` — the shared `GameDefinition` shape.
- `src/ui-kit/` — shared DOM interface primitives (buttons, counters, queues,
  inventory, meters). `src/shell/**` and `games/<slug>/mechanic/render/**`
  both build their DOM through this, not through their own `document.createElement`
  wrapper — see `src/ui-kit/README.md`.
- `src/render-kit/` — shared Phaser effects (punch, shake, flash, collapse,
  camera shake, move). `games/<slug>/mechanic/render/**` builds its tweens
  through this instead of writing a new one per game.
- `games/<slug>/game.config.ts` — one game's concrete definition.
- `games/<slug>/rules.md` — the rules of that game.

## Boundaries

- `src/shell/**` — do not modify unless explicitly asked to fix a shell bug.
  A change here affects every game in `games/**` on the next build.
- `src/ui-kit/**` and `src/render-kit/**` — same rule as `src/shell/**`:
  shared, so a change here affects every game and the shell chrome at once.
  Add to them deliberately (docs/decisions.md D-012 is the render-kit
  precedent for what "deliberately" looks like), not as a one-off for a
  single game's need.
- `games/<slug>/mechanic/**` — this is what changes per game. Implement
  `MechanicHost` from `src/shell-contract.ts`, and build its DOM/render
  through `ui-kit`/`render-kit` rather than reinventing either.
- Do not change `src/shell-contract.ts` without approval — every field added
  there is a field every future game has to care about. This includes adding
  `onFail`/a first-action hook for the `level_fail` / `retry` / `first_action`
  PostHog events that `SignalSink.ts` currently cannot fire — see D-011.
- Read `games/<slug>/rules.md` before writing mechanic code for that game. If
  a rule is missing or ambiguous, stop and ask — do not invent it.

The linter enforces the boundaries; it is not a style preference.
`games/*/mechanic/engine/**` cannot import Phaser, the DOM, `ui-kit`,
`render-kit`, storage, `fetch`, or anything under `src/shell/`. `src/shell/**`
cannot import Phaser, `render-kit`, or anything under `mechanic/`, and cannot
touch `window.localStorage`. `src/ui-kit/**` cannot import Phaser, `render-kit`,
`src/shell/**` or `mechanic/**`. `src/render-kit/**` cannot import `ui-kit`,
`src/shell/**` or `mechanic/**`. ui-kit and render-kit are siblings, not
layered on each other — DOM interface and Phaser juice stay orthogonal.

## Tech

- TypeScript strict. No `any` anywhere. `unknown` only where untrusted input
  enters (`parseProgress`, `parseLevelPack`) and is narrowed immediately.
- `games/<slug>/mechanic/engine` — pure functions. No mutation of the state
  passed in.
- Shell screens are HTML/CSS. Phaser renders the game only.
- Colours, spacing and fonts live in `src/styles/tokens.css`. The Phaser scene
  reads them at runtime — do not hard-code a colour in a scene.
- `levelCount` is always 5 (was 9 in the original template). Levels: versioned
  JSON in `games/<slug>/mechanic/levels`, validated on load.
- Progress via `ProgressRepository` — never `window.localStorage` directly.
- Signals via `SignalSink` (PostHog) — never call PostHog directly from a
  screen. Free-text comments via `FeedbackSink` (Web3Forms) — a separate
  interface, never mixed into `SignalSink`.
- Safe areas: use the `--safe-*` tokens, never bare `env(safe-area-inset-*)`.
- Every interactive element gets a `data-testid`. The E2E suite locates by it.
- No new production dependencies without approval. Keep `package-lock.json`.
- Capacitor/Android is opt-in (`npm run cap:sync`, `android:add`, `android:open`),
  never part of `npm run check` or the default `web` CI job.

## Phaser 4

`phaser@4.2.1` ships 28 official skills, synced into `.claude/skills/phaser-*`
on `npm install` (`scripts/sync-phaser-skills.ts`). When unsure about an API,
use those instead of guessing — in particular `phaser-v3-to-v4-migration` and
`phaser-v4-new-features`, because most Phaser code in the wild is v3 and v3
answers are frequently wrong here.

## Commands

```
npm run typecheck && npm run lint && npm test && npm run build && npm run e2e
```

`npm run check` runs all five. All must pass before declaring anything done.

## New game

Making `games/<slug>/` a real, buildable game is one pass, not several — end
of it, `npm run check` is green, levels included. There is no separate
"levels" step to leave for later.

1. The spec is `../specs/<slug>.md` (one level up from `app/` — see
   `specs/README.md`) if it's on the 30/30 shelf, or given directly in the
   task otherwise. Read it carefully. If anything a rule in §4 (decision
   table), §5 (win), §6 (loss) of the rules-template format would need is
   missing or ambiguous, stop and ask — do not invent it (same rule as
   editing an existing game's mechanic).
2. Copy `games/tap-targets/` as the starting skeleton — folder structure,
   not content: `game.config.ts`, `main.ts`, `index.html`, `rules.md` (copy
   the spec from `specs/<slug>.md` into this file — `specs/` stays the source,
   this is the copy that ships with the game), `mechanic/{index.ts, engine/,
   levels/, render/}`, `tests/{*.test.ts, e2e/}`. `games/tap-targets/mechanic/index.ts`
   shows the exact `MechanicHost` wiring; `main.ts` shows the three-line
   `bootShell(GAME, createMechanicHost())` entry every game uses unchanged.
3. `game.config.ts`: new `id`/`title`/`tagline`/`onboarding` from the rules.
   `levelCount: 5` — never anything else (`src/game-definition.ts` explains
   why). `analytics.postHogProjectToken`/`postHogHost` — copy from
   `games/tap-targets/game.config.ts` verbatim, every game shares the one
   PostHog project. `feedback.web3formsAccessKey` — copy the placeholder
   unless a real key has been provided for this game specifically.
4. `mechanic/engine/`: pure functions implementing the rules' decision table
   exactly — no DOM, no Phaser, no `fetch`, no `ui-kit`, no `render-kit` (the
   linter enforces this, see Boundaries). This is where the rules document
   becomes code; if a rule can't be written as a test per the rules-template
   standard, that's the ambiguity to raise in step 1, not to guess past here.
5. `mechanic/levels/`: `levels.json` with real content for all 5 levels
   (Способ А or Б from `docs/rules-template.md` §8 — whichever the rules
   used), plus a `loadLevels.ts` that validates the pack's length against
   `GAME.levelCount` on import, same pattern as `games/tap-targets`'s. A
   build that doesn't typecheck/build because `levels.json` is still a stub
   is the expected state mid-step-5, not a bug — but the game is not done
   until it's real content matching the difficulty curve the rules describe
   (`docs/rules-template.md` §9), not a placeholder. Standard genre
   convention applies unless the rules say otherwise: level 1 close to a
   tutorial (a player should clear it without failing), difficulty rises
   step to step without a spike, level 5 is the hardest and meant to take
   real effort. If a level plays no harder than the one before it, that is
   a levels.json bug, the same as any other.
6. `mechanic/render/`: `theme.ts` — copy `games/tap-targets/mechanic/render/theme.ts`
   as-is (it calls `ui-kit`'s `readUiTheme()`, nothing here is game-specific).
   The scene itself: build every animation from `render-kit` (`punch`,
   `invalidShake`, `successFlash`, `fadeCollapse`, `cameraShake`, `moveTo`)
   and every DOM overlay/HUD element from `ui-kit`, rather than writing a new
   tween or a new button. If neither kit has what a moment in this game
   needs, that is a "does this become a 7th render-kit effect / a new
   ui-kit component" decision (Boundaries: add deliberately) — raise it,
   don't write a one-off inline version to route around asking.
7. `tests/`: unit tests for the engine (pure, `environment: 'node'`, picked
   up automatically by `vitest.config.ts`'s `games/*/tests/**/*.test.ts`
   glob — nothing to register), plus `tests/e2e/*.spec.ts` modelled on
   `games/tap-targets/tests/e2e/` (`playthrough.spec.ts` intercepts the real
   PostHog/Web3Forms network calls; there is no test-only signal sink).
8. Nothing to register anywhere else — `vite.config.ts` globs every
   `games/*/index.html` automatically, `playwright.config.ts` globs every
   `games/*/tests/e2e/**/*.spec.ts` automatically.
9. `npm run check`. All five must pass. Report failures with their output —
   never describe a red suite as green.

## Kill-criterion (bot check)

Only for a game whose mechanic has a solver — a definable best-play
algorithm for the engine, not "a bot that plays okay". Most of the 30/30
games don't have one; check the game's entry in the concept portfolio before
assuming it needs this at all. If it doesn't, skip this section entirely —
don't add a bot for a game that was never meant to have one.

When it does apply: simulate on the real `mechanic/engine` — a random-play
bot and a greedy/solver-play bot, on the real `levels.json` from step 5
above, not a hand-picked easy case. Compare the metric the kill-criterion
document defines (win rate, survival rate — whatever the specific game's
rules named) against the threshold set for that game. This is deliberately
not built as reusable infrastructure ahead of time (no `scripts/greedy-check.ts`
exists yet) — build the simulation for the first game that actually has a
solver, learn from that one what's actually shared across games with
solvers, and only generalize it once there is a second real case to compare
against, not from guessing ahead of either.



Before coding: read the task, `games/<slug>/rules.md` (or `docs/decisions.md`
D-011 if the task is about the shell itself) and `src/shell-contract.ts`,
present a short plan, flag ambiguities. After coding: run all checks, show the
diff, state what is done and what is risky. Report failures with their output
— never describe a red suite as green.
