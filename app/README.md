# app — shared shell for the Prototype Validation Project

> **Шаги 3–5, Gate 3 и Gate 4.** Вход — `../specs/NN-<slug>.md`.
> Дальше: `node ../release.mjs <slug>` и `../distribution/`.
> Путь целиком — `../docs/PLAY.md`.

DOM shell + Phaser mechanic, shared across every 30/30 prototype. One HTML
entry per game at `games/<slug>/`; only `games/<slug>/mechanic/**` changes
between games — `src/shell/**` is written and tested once. Forked from
[stasHrytsko/game-template-](https://github.com/stasHrytsko/game-template-)
(see `docs/decisions.md` for what changed and why).

**Read in this order:** [`CLAUDE.md`](./CLAUDE.md) →
[`docs/decisions.md`](./docs/decisions.md).

`CLAUDE.md` is what is true today; `decisions.md` is why. The original
template's `architecture.md` was deleted on 2026-09-20 — every path in it had
stopped existing, and both files here had to spend a paragraph telling readers
to discount it.

Spec format lives outside `app/`: `specs/_TEMPLATE.md` is normative,
`specs/HOWTO.md` is the authoring guide.

## New game

Not a script. The original template's `scripts/new-game.ts` assumed one repo
per game and does not fit this layout, and no replacement is written yet —
`app/CLAUDE.md`, section «New game», is the procedure. Copy
`games/tap-targets/` by hand:

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
`PostHogSignalSink` (EU cloud) — the mechanic reports `first_action` and
failures through `shell-contract.ts`; the shell emits `first_action`,
`level_fail` and `retry` alongside the existing lifecycle events. Comments via
`Web3FormsFeedbackSink` (placeholder access key — see `docs/decisions.md`).
Capacitor/Android is opt-in, not part of the daily build (`npm run check`
never touches it).

`games/tap-targets/` is a stub (`Tap Targets`), not a shipping game — it
exists to prove the shared shell + multi-page build actually work, the same
role the placeholder mechanic played in the original template.
