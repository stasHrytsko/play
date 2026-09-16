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
- `games/<slug>/game.config.ts` — one game's concrete definition.
- `games/<slug>/rules.md` — the rules of that game.

## Boundaries

- `src/shell/**` — do not modify unless explicitly asked to fix a shell bug.
  A change here affects every game in `games/**` on the next build.
- `games/<slug>/mechanic/**` — this is what changes per game. Implement
  `MechanicHost` from `src/shell-contract.ts`.
- Do not change `src/shell-contract.ts` without approval — every field added
  there is a field every future game has to care about. This includes adding
  `onFail`/a first-action hook for the `level_fail` / `retry` / `first_action`
  PostHog events that `SignalSink.ts` currently cannot fire — see D-011.
- Read `games/<slug>/rules.md` before writing mechanic code for that game. If
  a rule is missing or ambiguous, stop and ask — do not invent it.

The linter enforces the boundaries; it is not a style preference.
`games/*/mechanic/engine/**` cannot import Phaser, the DOM, storage, `fetch`
or anything under `src/shell/`. `src/shell/**` cannot import Phaser or
anything under `mechanic/`, and cannot touch `window.localStorage`.

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

## Workflow

Before coding: read the task, `games/<slug>/rules.md` (or `docs/decisions.md`
D-011 if the task is about the shell itself) and `src/shell-contract.ts`,
present a short plan, flag ambiguities. After coding: run all checks, show the
diff, state what is done and what is risky. Report failures with their output
— never describe a red suite as green.
