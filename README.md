# PLAY

The live hub and prototype factory for Stas Hrytsko's 30-prototype
game-design project. PLAY is a repeatable production pipeline that turns a
game idea into a standardized spec, a playable prototype, a checked build and
a published game. Deployed at play.hrytsko.com.

The canonical high-level definition of PLAY, its framework, responsibilities
and production flow lives in [docs/PLAY.md](docs/PLAY.md).

The write-up, career page and the rest of the personal site live in a separate
repository (`stasHrytsko/hrytsko`, hrytsko.com); this repo holds the hub and
the games that run on it.

## Run locally

The hub needs no installation or build step. From the repository root:

```sh
python3 -m http.server 8000
```

Open http://localhost:8000.

## Publishing a prototype

The playable build lives in `app/` (Vite + Phaser) and is published to the
hub by one command from the repository root:

```sh
node release.mjs <slug>          # publish
node release.mjs <slug> --dry    # show what would happen, write nothing
```

It typechecks and builds `app/`, copies the build to `g/<slug>/`, fills in
`links.play` and the release date in `games.json`, and reruns the generator.
Then commit and push — the host serves the repository root as-is.

Two URLs on purpose:

- `/g/<slug>/` — the playable build.
- `/<slug>/` — the page with the description, metrics and feedback.

The slug in `games.json` must match the folder name in `app/games/`; the
script refuses to publish under a different name rather than quietly
creating a second identity for the same game.

## Where everything stands

```sh
node pipeline.mjs            # the whole board, in the terminal
node pipeline.mjs --waiting  # only what needs a decision from you
node pipeline.mjs --write    # refresh dashboard/status.json
node pipeline.mjs --check    # fail if it has fallen behind (runs in CI)
```

`dashboard/` is the same board as a page, deployed separately on Vercel from
that folder. See `dashboard/README.md`.

**Rule: the board never lags the repository.** Stages are never stored — they
are computed from which files exist. The snapshot is committed, so the page is
plain static and works under any hosting configuration, and
`node pipeline.mjs --check` fails CI if it was left behind. Anything that
depends on today's date is recomputed in the browser, so a tab left open does
not go stale either. See `CLAUDE.md`.

Nothing stores a stage. It is computed from which files exist — an idea, a
spec with its review field, a game folder, how many levels its pack holds
(one means a slice awaiting the human gate), the signature in its review.md, a
play link in games.json, a data pull, a verdict. So the board cannot go stale
the way a status column does.

## The schedule

`games.json` maps day → slug and holds the links, dates, metrics and feedback.
Titles and pitches are not in it: those live in each spec's YAML front matter
(`specs/NN-<slug>.md`) and are read from there, so there is exactly one place
to change a name. After editing either, regenerate the log grid and
per-prototype pages:

```sh
node build-games.mjs
```

The script has no dependencies. It rewrites the upcoming card and prototype
grid in `index.html`, then writes one static page per prototype with
`"status": "published"`. A `"scheduled"` entry powers the hidden upcoming
card; `"planned"` entries remain empty slots. The launch schedule begins on
1 October 2026 and runs for 30 consecutive days. Releasing a prototype also
means marking the next concept as `scheduled`.

Run `node test-hub.mjs` to check the client-side hub behavior (UTM
persistence, the "Tomorrow" label, the tracking adapter)
without a browser.

## Analytics

`hub.js` labels a release as "Tomorrow" when appropriate, persists
first/latest UTM attribution in local storage and attaches that attribution
to every custom event. Cards render in schedule order (Day 01 → Day 30), not
shuffled.

PostHog is intentionally inactive until `projectToken` and `apiHost` are
filled in `analytics-config.js`. Use the Project API token from PostHog
project settings, never a personal API key. Autocapture and session
recording are disabled; the hub emits explicit project events only.

## Structure

- `index.html` — the hub: hero, upcoming release, prototype log grid.
- `app/` — the game factory: shared shell, per-game mechanics, tests (Vite + Phaser).
- `trends/` — dated market observations; the raw material ideas are scored against.
- `ideas/` — the pipeline's input: `active/` and `rejected/`, one file per concept.
- `specs/` — the concept specifications, the normative template and the validator.
- `docs/PLAY.md` — canonical high-level definition of PLAY and the prototype production flow.
- `docs/templates/` — templates for the idea, the manual review and a game's media.
- `data/`, `results/` — the funnel pulled from PostHog and the verdict per concept.
- `docs/decisions.md` — the log of the project's decisions (`app/docs/decisions.md` holds the factory's).
- `games.json` — source of truth for the schedule, concepts, links, metrics and feedback.
- `analytics-config.js` — launch date, timezone and PostHog client configuration.
- `hub.js` — upcoming-date logic, UTM attribution, analytics controls and event capture.
- `build-games.mjs` — dependency-free generator for the log grid and per-prototype pages.
- `CLAUDE.md` — the rules that hold in this repository.
- `pipeline.mjs` — the status board: what stage each concept is at and what is waiting on you.
- `dashboard/` — the same board as a page, for a screen; deployed separately.
- `release.mjs` — builds `app/` and publishes one game to `g/<slug>/`.
- `g/` — published playable builds; `g/assets/` holds their shared hashed bundles.
- `test-hub.mjs` — headless behavior check for `hub.js`.
- `styles.css` — shared visual design, carried over from hrytsko.com for a consistent brand.
- `favicon.svg`, `404.html` — shared site chrome.

## Hosting

Plain HTML, CSS and JS; deploy directly on Vercel or another static host,
serving the repository root with no build command — `build-games.mjs` runs
locally and its output is committed. Point the `play` custom domain here and
add a CNAME record for `play` in hrytsko.com's DNS.

`noindex,follow` is not set here — this hub is meant to be found and played,
unlike the still-in-progress rest of the personal site.
