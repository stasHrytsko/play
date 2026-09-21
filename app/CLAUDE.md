# app — shared shell, Prototype Validation Project (30/30)

Shared DOM shell + Phaser mechanic. One game per `games/<slug>/`; only
`games/<slug>/mechanic/**` changes between games.

## Architecture

- `docs/decisions.md` — engineering decisions about this factory, with their
  trade-offs. Read D-011 first; it is the fork's own entry. Project-level
  decisions — pipeline, gates, thresholds — live in `../docs/decisions.md`.
- `../docs/PLAY.md` — the pipeline this factory sits inside.
- `../CLAUDE.md` — the four rules that hold across the repository, including
  rule 4: no new machinery until the same thing has broken twice.
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
  there is a field every future game has to care about. The deliberate D-014
  extension is now part of the contract: mechanics call `onFirstAction()` on
  the first meaningful input and `onFail(reason)` on a failed attempt. The
  shell owns analytics and retry UI; mechanics never call PostHog directly.
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
- `levelCount` is 5 in a finished game and 1 while it is a slice (was 9 in the
  original template), and always equals the pack's length. Levels: versioned
  JSON in `games/<slug>/mechanic/levels`, validated on load.
- Progress via `ProgressRepository` — never `window.localStorage` directly.
- Signals via `SignalSink` (PostHog) — never call PostHog directly from a
  screen. Free-text comments via `FeedbackSink` (Web3Forms) — a separate
  interface, never mixed into `SignalSink`. Both are live only on the hub's
  own domain (`src/shell/reporting.ts`): every build ships the same PostHog
  token, and the experiment's verdict is read off that one funnel. `?signals=on`
  turns them on anywhere, which is what the E2E suite navigates with.
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

Two passes, with the one human gate between them (`../docs/PLAY.md`):

- **Pass 1 — the slice.** Everything real (engine, renderer, HUD, tests) but
  **one** level. `npm run check` green at the end of it. Then stop and hand it
  over: the gate is three minutes on a phone, and the answer may be "kill".
- **Pass 2 — the levels.** Only after `review: approved` in
  `games/<slug>/review.md`: levels 2–5, the difficulty curve, the
  kill-criterion check, `levelCount: 5`.

Each pass ends green. Neither ends with something to finish later — a slice
with a stubbed engine is not a slice, it is an unfinished game with fewer
levels.

1. The spec is `../specs/NN-<slug>.md` (one level up from `app/` — see
   `specs/README.md`) if it's on the 30/30 shelf, or given directly in the
   task otherwise. Read it carefully. Section numbers below refer to
   `specs/_TEMPLATE.md`, the one normative format. If anything §2 (win and
   loss), §3 (rules) or §5 (input) would need is missing or ambiguous, stop
   and ask — do not invent it (same rule as editing an existing game's
   mechanic). A section marked "не применимо" is an answer; a silently
   missing one is not. §7.1 is the picture of the screen: what takes which
   share of it, what has to be readable in a second, and — when the mechanic
   is built on colour — what the second channel is. No §7.1 is the same kind
   of gap as a missing rule: raise it rather than inventing a layout.
2. Copy `games/tap-targets/` as the starting skeleton — folder structure,
   not content: `game.config.ts`, `main.ts`, `index.html`, `rules.md` (copy
   the spec from `../specs/NN-<slug>.md` into this file — `specs/` stays the source,
   this is the copy that ships with the game), `mechanic/{index.ts, engine/,
   levels/, render/}`, `tests/{*.test.ts, e2e/}`. `games/tap-targets/mechanic/index.ts`
   shows the exact `MechanicHost` wiring; `main.ts` shows the three-line
   `bootShell(GAME, createMechanicHost())` entry every game uses unchanged.
3. `game.config.ts`: new `id`/`title`/`tagline`/`onboarding` from the rules.
   `levelCount: 1` in pass 1, `levelCount: 5` in pass 2 — those are the only
   two legal values, and it always equals the number of levels in
   `levels.json` (`src/game-definition.ts` explains why). `analytics.postHogProjectToken`/`postHogHost` — copy from
   `games/tap-targets/game.config.ts` verbatim, every game shares the one
   PostHog project. `feedback.web3formsAccessKey` — copy the placeholder
   unless a real key has been provided for this game specifically.
4. `mechanic/engine/`: pure functions implementing the rules' decision table
   exactly — no DOM, no Phaser, no `fetch`, no `ui-kit`, no `render-kit` (the
   linter enforces this, see Boundaries). This is where the rules document
   becomes code; if a rule can't be written as a test — the bar set by
   `specs/_TEMPLATE.md` — that's the ambiguity to raise in step 1, not to
   guess past here.
   The render/host layer must report the first meaningful valid input through
   `onFirstAction()` and every deterministic loss through
   `onFail('<stable_reason_code>')`. The shell de-duplicates first action,
   emits analytics, shows the loss popup and owns retry.
5. `mechanic/levels/`: `levels.json` (Способ А or Б from
   `specs/_TEMPLATE.md` §6 — whichever the spec used) plus a `loadLevels.ts`
   that validates the pack's length against `GAME.levelCount` on import, same
   pattern as `games/tap-targets`'s.
   **Pass 1: one level, and it is real content** — close to a tutorial, a
   player should clear it without failing, and every rule the mechanic has
   should be reachable on it. It is the only thing the human will see at
   the gate, so a placeholder grid makes the gate meaningless.
   **Pass 2: levels 2–5**, matching the difficulty curve the spec describes
   (§6 requires the difference between every adjacent pair to be named).
   Difficulty rises step to step without a spike, level 5 is the hardest and
   meant to take real effort. If a level plays no harder than the one before
   it, that is a levels.json bug, the same as any other. Bump
   `levelCount` to 5 in the same pass.
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
   never describe a red suite as green. Screenshot the level on a phone
   viewport and look at it before calling the pass done: both bugs in the
   first game built this way were layout bugs that every test and every type
   was happy with — the plate collapsed to 4px, and later outgrew its box.
   E2E asserts a floor and a fit on the canvas for exactly that reason.
10. End of pass 1: say the slice is ready to play and stop. The human writes
   `review: approved | rework | rejected` into `games/<slug>/review.md`
   (`../docs/templates/review.md`). Pass 2 starts from that line, not from
   your own judgement that the slice looks fine.

## Kill-criterion (bot check)

Only for a game whose mechanic has a solver — a definable best-play
algorithm for the engine, not "a bot that plays okay". Most of the 30/30
games don't have one; `solver: required` in the spec's front matter is what
says it does — check that before assuming it needs this at all. If it doesn't, skip this section entirely —
don't add a bot for a game that was never meant to have one.

When it does apply: it belongs to pass 2, not to the slice — one level proves
nothing about a strategy. Simulate on the real `mechanic/engine` — a
random-play bot and a greedy/solver-play bot, on the real `levels.json` from
step 5 above, not a hand-picked easy case. Compare the metric the kill-criterion
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
