# Decisions — the factory

Engineering decisions about the shared shell and the build, and what each one
costs. Recorded so that a future change is an informed reversal rather than a
rediscovery.

**Two logs, two scopes.** This one is about `app/` — the factory. The project's
own decisions — the pipeline, the gates, the thresholds, the specs — live in
`../../docs/decisions.md`. When a decision touches both, it is recorded there
and referenced here.

---

## D-001 — TypeScript 6, not 7

**Decision:** pin `typescript@6.0.3`.

TypeScript 7 is released (7.0.2) but `typescript-eslint@8.68.0` declares
`typescript: >=4.8.4 <6.1.0`. On TS 7 the entire `npm run lint` step — including
the rules that enforce the Shell/Mechanic boundary — stops working.

**Cost:** one major version behind. **Reversal:** bump when typescript-eslint
ships TS 7 support; nothing else in the project depends on the version.

---

## D-002 — Phaser 4, with the official skills as the antidote

Kept from the architecture document. What changed is the mitigation: Phaser
4.2.1 ships **first-party Claude skills** in `node_modules/phaser/skills/` — 28
of them, including `v3-to-v4-migration` and `v4-new-features`. They are
versioned with the exact Phaser installed, which a third-party plugin cannot be.

`scripts/sync-phaser-skills.ts` copies them into `.claude/skills/phaser-*` on
postinstall, so an agent picks them up automatically and they are re-synced
whenever Phaser is upgraded. The copies are git-ignored — they belong to the
installed version, not to the repository.

The third-party alternative, `Yakoub-ai/phaser4-gamedev`, was checked and not
installed: it targets Phaser **4.0.0-rc.7** while this project runs 4.2.1, so
its skills would teach an older API than the one installed — the exact failure
it exists to prevent. Its genuinely distinct piece is a PreToolUse hook that
blocks v3 API before a file is written; that hook is worth revisiting if the
project keeps drifting into v3 idioms.

**Cost:** 28 extra skill descriptions in an agent's context in this repository.
**Reversal:** falling back to Phaser 3 still does not touch shell, contract,
progress, signals or CI.

---

## D-003 — `android/` is not committed in the template

`npx cap add android` writes `MainActivity.java` into
`android/app/src/main/java/com/example/gametemplate/`. The appId is part of a
**directory path**, so `new-game` cannot rename it with a text substitution
without producing a project that does not compile.

**Decision:** the template ignores `android/`. Each game runs
`npm run android:add` right after `npm run new-game`, and commits `android/`
from then on. `scripts/check-placeholders.ts` still scans it, so a stale native
project cannot ship unnoticed.

**Cost:** one extra command per game, and CI regenerates the project on every
run. **Reversal:** delete the `android/` line from `.gitignore` in a game repo.

---

## D-004 — Safe areas come from two different mechanisms

`@capacitor/android` 8 contains `com.getcapacitor.plugin.SystemBars`, which
injects `--safe-area-inset-*` as an **inline style on `documentElement`** rather
than populating `env(safe-area-inset-*)`.

A layout written only against `env()` looks correct in Chrome and clips under
the status bar on a real Android 15+ phone. `src/styles/tokens.css` therefore
reads `var(--safe-area-inset-top, env(safe-area-inset-top, 0px))`, and
`capacitor.config.ts` pins `SystemBars.insetsHandling: 'css'`.

**Cost:** the indirection has to be explained, which is what this entry is for.

---

## D-005 — The ntfy request is a CORS "simple request"

> Superseded by D-011: the signal transport is PostHog now, not ntfy. Left
> here for the record — the CORS reasoning was specific to ntfy's headers and
> does not carry over.

Sending ntfy's `Title`/`Tags`/`Priority` headers turns the POST into a
preflighted cross-origin request — an extra `OPTIONS` round-trip that has to
succeed from both a browser and the Android WebView, for a two-word payload.

**Decision:** `text/plain` body, no custom headers, no preflight.
**Cost:** the phone notification shows the raw message instead of a formatted
title. **Reversal:** add the headers back and verify the preflight on-device.

---

## D-006 — `onboarding.rules: string[]`, and a `tagline`

The architecture document specified `onboarding.body: string`. The game standard
in the parent `CLAUDE.md` specifies a list of 4-6 rules with icons. A single
string cannot be rendered as a list without the shell parsing prose.

**Decision:** `GameDefinition.onboarding.rules` is an array, and `tagline` was
added for the one-line description under the title.

The two documents also disagreed about where the rules appear. Resolution: the
rules live **only** in the Onboarding screen — shown automatically when the
stored onboarding version is stale, and reachable any time from the menu's
"Как играть". The main menu does not repeat them. A first-run player still sees
the rules before the first level, which was the intent of both documents.

---

## D-007 — There is no loss path in the contract

`MechanicHost` reports `onComplete` and `onExit`. There is no `onFail`, so the
shell cannot show the "Поражение" popup that the parent `CLAUDE.md` standard
describes. The architecture document's contract has no such event either, and
`CLAUDE.md` forbids widening it unasked.

**Current state:** deliberate gap. `src/shell/screens/Popup.ts` is already
generic enough that a loss popup is a call to the same function.

**If a game needs it:** add `onFail(reason: string): void` to
`CreateLevelParams`, handle it in `ShellApp.#levelFailed`, and record the change
here. That is roughly fifteen lines.

---

## D-008 — Callbacks are properties, not methods

`CreateLevelParams.onComplete: () => void` rather than `onComplete(): void`.
Method syntax makes them unbound methods, which the linter correctly flags the
moment they are passed around — and they exist to be passed around.

---

## D-009 — Phaser is one 1.4 MB chunk, on purpose

`dist/assets/index-*.js` is ~1.4 MB (367 kB gzipped), almost entirely Phaser.
Splitting it would require the shell to load the mechanic lazily, which means an
async seam in the contract.

Inside an APK the bundle is read from the local filesystem, so the download
argument does not apply and only parse time remains.

**Decision:** keep it in one chunk; `chunkSizeWarningLimit` is raised so the
build does not print an unactionable warning. **Reversal:** if cold start on a
cheap phone is measurably bad, make `ShellAppDeps.mechanic` a
`() => Promise<MechanicHost>`.

> Numbers updated by D-011: with `posthog-js` added, the same chunk is now
> ~1.69 MB (463 kB gzipped) — over `chunkSizeWarningLimit: 1600`, so the
> warning is back. Not fixed yet; see D-011.

---

## D-010 — E2E taps real pixels, and no test hook exists in `src/`

The playthrough test computes tap coordinates from the same `levels.json` the
game ships and clicks the real canvas, then intercepts the real `https://ntfy.sh`
request with `page.route`.

There is deliberately **no** test-only sink, query flag or `window` hook in
production code. **Cost:** the test knows `@capacitor/preferences` stores under
`CapacitorStorage.<key>` in the browser, used to seed progress in one test.
That coupling is documented at the constant.

> Superseded by D-011: the intercepted host is `eu.i.posthog.com` (and
> `api.web3forms.com` for comments) now, not `ntfy.sh`. The "no test hook"
> principle is unchanged.

---

## D-011 — Forked for the Prototype Validation Project (30/30), 2026-09-16

Everything below was agreed in chat, not decided unilaterally here — recorded
so the reasoning survives outside that conversation. The project-level record
(naming, PostHog project, Web3Forms account) lives in the play repo's own
`docs/decisions.md`, one level up from this one; this entry covers only what
changed inside this shell.

**`levelCount` fixed at 5, not 9.** Was a free parameter adapting the level
grid; the 30/30 rules (13 — Правила эксперимента 30/30) fix it. Kept as a
field rather than a hard-coded constant so LevelSelect, progress and the
mechanic never have three numbers to keep in sync — see `game-definition.ts`.

**Difficulty bands dropped (`difficulty.ts` deleted).** A 3x3 grid with an
easy/medium/hard legend made sense at 9 levels; at 5 it added a UI element
without adding information. `LevelSelect` is a single vertical list now.

**One repo, many games — `games/<slug>/`, not "template is copied, not
inherited" (D-history: the original architecture doc's core principle).**
`src/shell/**` is written once and shared; only `games/<slug>/mechanic/**`
differs. `vite.config.ts` builds every `games/*/index.html` it finds as a
separate multi-page entry — Rollup dedupes the shared import graph, so a
shell fix lands in every game's `dist/` on the next build. Chosen for
maintainability over strict isolation; the trade-off is that a bug in
`src/shell/**` now affects every game at once, where it used to affect one
repo at a time.

**`NtfySignalSink` → `PostHogSignalSink`.** The rules need a full behavioural
log (game_open, level_start, level_win, …), not one "would you like more"
ping — see `SignalSink.ts` for exactly which events the shell can fire today.
Three from the rules document are NOT implemented: `level_fail`, `retry` and
`first_action` all need `MechanicHost` (`shell-contract.ts`) to report
something it currently cannot — this widens D-007's gap rather than closing
it. `hub_impression`/`hub_click`/`teaser_click` belong to the hub site
(`stasHrytsko/play`, root `analytics-config.js`), not this shell.
`session_2`/`return_d1`/`return_d7` are not custom events at all: PostHog
computes retention from its own persisted `distinct_id` plus `game_open`, via
its Retention insight.

**`MoreScreen` (yes/no) → `RatingScreen` (1-5 stars + optional comment).**
The product question changed from binary to calibrated. The star value
always goes to PostHog as `rating_submit`; free text never does — it goes
through a new, parallel `FeedbackSink` (`Web3FormsFeedbackSink`) straight to
email, because unstructured text in an analytics tool is something nobody
reads. `ProgressState.moreAsked` → `ratingAsked`; `PROGRESS_SCHEMA_VERSION`
1 → 2 — an old progress blob is discarded, not migrated (by the file's own
existing rule), so a returning player replays the rating prompt once.

**Capacitor/Android out of the default path, not removed.** `npm run check`
never touched Capacitor even before this fork (`cap:sync`/`android:add` were
already separate scripts) — what actually ran on every push was the `android`
CI job's `assembleDebug`. That job is now `workflow_dispatch`-only. Packaging
a phase-2 winner still works; `webDir: 'dist'` now contains every game's
build, so picking one out is an open gap, deliberately not solved until there
is an actual winner.

**`scripts/new-game.ts`, `check-placeholders.ts`, `placeholders.ts` deleted.**
They rewrote strings in place across a fixed set of files — a model that
assumed one repo per game. Scaffolding a new `games/<slug>/` folder is a
different shape of problem, assigned to the `/new-game` skill rather than
patched here.

**Cost, honestly:** `posthog-js` pushed the shared JS chunk from ~1.4 MB to
~1.69 MB (367 kB → 463 kB gzipped, D-009). Not addressed — worth revisiting if
cold start on a cheap phone becomes a measured problem, same reversal path
D-009 already describes.

**Not done in this pass:** the Playwright E2E specs were rewritten for the
new layout and the rating flow but not executed — no headless browser was
available where this fork was built. `npm run typecheck`, `npm run lint`,
`npm test` (67 tests) and `npm run build` all pass; `npm run e2e` needs a
local run before it's trusted.

---

## D-012 — render-kit: six effects, no new dependency, 2026-09-16

**Decision:** `src/render-kit/` ships six Phaser tween helpers — `punch`,
`invalidShake`, `successFlash`, `fadeCollapse`, `cameraShake`, `moveTo` —
hand-written on Phaser's own Tween/Camera API. Every mechanic's render
module reaches for these instead of writing its own tween.

**Why six, not five:** the original plan (05 — Архитектура шаблона) named
five in-place effects. Reading the 30/30 canonical shelf (Google Sheet,
29 concepts) before writing any code showed most concepts move something
from A to B, not just in place — a screw into a container, a car into a
slot, a branch tip advancing, water along a pipe segment. `moveTo` is the
sixth, the same kind of primitive as the other five (a thin wrapper around
one Phaser tween), added on survey evidence rather than guessed.

**Why not `phaser4-rex-plugins`:** researched, not adopted. It's compatible
with the installed Phaser 4.2.1 and its individual effect functions (PopUp,
ScaleDownDestroy, ShakePosition, Fade) can be imported standalone without
the plugin-registration system — better than D-002's experience with a
different, version-lagging plugin. But it's ~156 MB unpacked, the deep
import paths (`phaser4-rex-plugins/plugins/...`) aren't a documented stable
surface, and the effects themselves are 10-20 lines each. Its parameter
naming (`duration`, `magnitude`, `ease`) was kept as a reference for our own
API, not the dependency.

**`successFlash` requires a `Tintable` target.** Tint is a Sprite/Image
feature; Phaser Shapes (Arc, Rectangle — what the stub mechanic uses) don't
have it. Calling `successFlash` on one is a compile error, not a silent
no-op — a mechanic using shapes reaches for `punch` instead.

**Every effect returns `Promise<void>`**, resolving when visually done, so
a render module can `await` a sequence instead of nesting `onComplete`
callbacks. A future cascade helper (chained flashes with a stagger) can be
built on top of these without needing a seventh primitive.

**Dogfooded, not just typechecked:** `games/tap-targets/mechanic/render/LevelScene.ts`'s
one hand-written inline tween now calls `fadeCollapse`. Same visual result;
proves the API against real usage.

---

## D-013 — shell adopts ui-kit; per-game theme.ts stops duplicating readUiTheme, 2026-09-16

**Decision:** `src/shell/dom.ts` (`el`, `button`, an unused `clear`) is
deleted. Every shell screen (`MainMenu`, `Onboarding`, `GameScreen`,
`Popup`, `LevelSelect`, `RatingScreen`) and `App.ts`'s popup actions now
build their DOM through `src/ui-kit/` (`uiEl`, `uiButton`) instead of a
second, near-identical implementation. `games/tap-targets/mechanic/render/theme.ts`
now calls `ui-kit`'s `readUiTheme()` for the CSS-token read instead of
re-doing `getComputedStyle` itself — it keeps only the one thing `ui-kit`
can't do (turning a colour string into the numeric hex Phaser wants).

**Why:** two DOM builders with the same shape (`className`/`text`/`testId`/
`attrs`) under different names was the actual duplication, not a stylistic
gap — one of them had to go, and `ui-kit` is the one meant to outlive a
single game.

**What that required:**
- `UiButtonOptions` gained `block?: boolean` (full width) — shell's buttons
  are almost all full-width, ui-kit's weren't tracking that at all before.
  `.ui-button--block { width: 100%; }` in `ui-kit.css`.
- The dead `.btn`/`.btn--primary`/`.btn--ghost`/`.btn--block`/`.game-header__back`
  rules in `shell.css` are gone — `.ui-button--compact` already covered what
  `.game-header__back` existed for.
- `PopupAction` is now `Omit<UiButtonOptions, 'block'>` (Popup always passes
  `block: true` itself) instead of its own near-duplicate of the old
  `ButtonOptions`. Every `{ text: ... }` action object in `App.ts` became
  `{ label: ... }` to match.
- `UiTheme` (ui-kit/theme.ts) gained `accentHover`, read from `--accent-hover`
  — the one field the per-game theme.ts needed that `readUiTheme()` didn't
  expose yet.

**Cost:** `src/shell/**` now depends on `src/ui-kit/**` — the eslint
boundary for `src/ui-kit/**` (D-012's commit) explicitly left this direction
open rather than deciding it; this entry is that decision. `render-kit`
stays independent of `ui-kit` on both sides (Phaser juice and DOM interface
are orthogonal) — only `ui-kit` gained a new consumer, not a new dependency.

**Verified:** typecheck, lint, test (67/67, same data-testid values
throughout so nothing needed to change on the test side), build — all pass.


---

## D-014 — first action, failure and retry cross the Shell ↔ Mechanic boundary, 2026-09-19

**Decision:** widen `CreateLevelParams` with exactly two callbacks:
`onFirstAction()` and `onFail(reason)`.

- `onFirstAction()` is called by the mechanic on the first meaningful valid
  gameplay input. The shell de-duplicates it defensively and emits
  `first_action`.
- `onFail(reason)` is called when the attempt reaches the deterministic loss
  condition defined by that game's rules. `reason` is a stable
  machine-readable mechanic-owned code (for example `pocket_overflow`).
  The shell emits `level_fail` and shows the shared fail popup.
- `retry` is deliberately **not** a mechanic callback. Retrying is shell
  navigation: the retry button emits `retry` and remounts the same level.
- Stale callbacks from a destroyed level session are ignored, same as stale
  completion callbacks.

**Why:** the original D-011 fork could observe only completion and exit. That
made `first_action`, `level_fail` and `retry` impossible to measure
without breaking the architecture by calling analytics from individual games.
The first scheduled concept already has a real loss state, so leaving the gap
open would make its rules and experiment metrics disagree with the runtime.

**Boundary cost:** every game host now receives the two callbacks, but games
without a loss condition simply never call `onFail`. Analytics remains owned
by the shell; the pure engine remains unaware of UI and PostHog.


---

## D-015 — `readTheme()` scopes to `params.container`, not `document.documentElement`; a game may shadow `--piece-*` locally, 2026-09-22

**Decision:** `games/<slug>/mechanic/index.ts` now calls `readTheme(params.container)`
instead of `readTheme()`, and adds the game's root class to `params.container`
*before* that call, not after. `ui-kit`'s `readUiTheme(root)` already took an
optional root element (D-013) — it was simply never called with one. No
change to `ui-kit`, `render-kit`, or `tokens.css` itself.

A game's own stylesheet can now declare, under its own root class:

```css
.two-moves-later-surface {
  --piece-rose: #e0483f;
  --piece-blue: #2f6fe0;
  --piece-mustard: #f0b429;
}
```

CSS custom-property inheritance does the rest: `getComputedStyle` on that
element resolves to the shadowed value, `getComputedStyle` on anything
outside it (buttons, onboarding, rating — none of which live inside the
game's root class) still resolves to the unshadowed `tokens.css` value.
Nothing shared changed; two elements now legitimately disagree on one
custom property's value, which is what CSS custom properties are for.

**Why:** `tokens.css`'s own comment says the DOM shell and the Phaser canvas
"cannot drift apart" — true and still enforced, for the shell chrome. But the
one shared palette (dusty brand pastels — rose/blue/mustard) was never a
considered choice for game canvases specifically; it's what a fork of the
personal-site template happened to carry over, and no decision entry argued
for it before this one. `two-moves-later`'s taxi colours read as near-
identical at a glance on a phone — the opposite of what a colour-match
mechanic needs. The fix is a one-line override in the one file that's
already game-specific, not a second palette system.

**What this does not change:** the shell chrome — buttons, onboarding card,
rating popup — stays on one palette across every game, on purpose: comparing
thirty prototypes stays easier when the frame around each one is identical,
and fixing the chrome once still fixes it everywhere. Only the canvas-only
`--piece-*` tokens are meant to be shadowed this way; shadowing `--accent`,
`--surface`, or anything the shell itself reads would leak into the chrome
through the same container, since `.two-moves-later-surface` is inside the
shell's own DOM tree.

**Verified:** typecheck, lint, test (106/106), build, e2e (both
`two-moves-later` specs) — all pass. Confirmed by reading computed styles at
runtime: `document.documentElement`'s `--piece-rose` stayed `#df8ca0`,
`.two-moves-later-surface`'s resolved to `#e0483f`; `--accent` unchanged on
both. Screenshot taken on a phone viewport to confirm the board itself, not
just the numbers.
