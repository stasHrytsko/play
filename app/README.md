# app — shared shell for the Prototype Validation Project

DOM shell + Phaser mechanic, shared across every 30/30 prototype. One HTML
entry per game at `games/<slug>/`; only `games/<slug>/mechanic/**` changes
between games — `src/shell/**` is written and tested once. Forked from
[stasHrytsko/game-template-](https://github.com/stasHrytsko/game-template-)
(see `docs/decisions.md` for what changed and why).

**Read in this order:** [`CLAUDE.md`](./CLAUDE.md) →
[`docs/architecture.md`](./docs/architecture.md) →
[`docs/decisions.md`](./docs/decisions.md).

## New game

Not yet a script — `scripts/new-game.ts` from the original template assumed
one repo per game and does not fit this layout. Scaffolding a new
`games/<slug>/` folder from a spec is the `/new-game` skill's job (see
`docs/decisions.md`). Until then, copy `games/tap-targets/` by hand:

```bash
cp -r games/tap-targets games/your-slug
# edit games/your-slug/game.config.ts, main.ts imports, mechanic/**
```

Then implement `games/<slug>/mechanic/**`: `engine` (pure rules) → `levels`
(JSON) → `render` (Phaser scene). Leave `src/shell/**` alone.

## Commands

| | |
|---|---|
| `npm run dev` | dev server |
| `npm run check` | typecheck + lint + test + build + e2e |
| `npm run cap:sync` | build + sync into android/ (phase 2 only) |
| `npm run android:open` | open the project in Android Studio (phase 2 only) |

## What's here

Main menu, versioned onboarding, a single vertical level list (always 5
levels, no difficulty bands), game screen, win popup, and a rating popup
(1–5 stars + optional comment) after the last level. Progress via
`@capacitor/preferences` (falls back to localStorage on web). Analytics via
`PostHogSignalSink` (EU cloud) — see `SignalSink.ts` for exactly which
events the shell can fire today, and which three (`level_fail`, `retry`,
`first_action`) need a `shell-contract.ts` change first. Comments via
`Web3FormsFeedbackSink` (placeholder access key — see `docs/decisions.md`).
Capacitor/Android is opt-in, not part of the daily build (`npm run check`
never touches it).

`games/tap-targets/` is a stub (`Tap Targets`), not a shipping game — it
exists to prove the shared shell + multi-page build actually work, the same
role the placeholder mechanic played in the original template.
