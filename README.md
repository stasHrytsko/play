# PLAY

The live hub for the Prototype Validation Project — Stas Hrytsko's 30-prototype
game-design experiment. Deployed at play.hrytsko.com. The write-up, career
page and the rest of the personal site live in a separate repository
(`stasHrytsko/hrytsko`, hrytsko.com); this repo is only the playable hub.

## Run locally

No installation or build step needed. From the repository root:

```sh
python3 -m http.server 8000
```

Open http://localhost:8000.

## Publishing a prototype

`games.json` is the single source of truth for the launch schedule, concepts,
links, metrics and feedback summaries. After editing it, regenerate the log
grid and per-prototype pages:

```sh
node build-games.mjs
```

The script has no dependencies. It rewrites the upcoming card and prototype
grid in `index.html`, then writes one static page per prototype with
`"status": "published"`. A `"scheduled"` entry powers the hidden upcoming
card; `"planned"` entries remain empty slots. The launch schedule begins on
1 October 2026 and runs for 30 consecutive days.

To release a prototype: add its playable URL under `links.play`, change its
status from `scheduled` to `published`, mark the next concept as
`scheduled`, and run the generator.

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
- `games.json` — source of truth for the schedule, concepts, links, metrics and feedback.
- `analytics-config.js` — launch date, timezone and PostHog client configuration.
- `hub.js` — upcoming-date logic, UTM attribution, analytics controls and event capture.
- `build-games.mjs` — dependency-free generator for the log grid and per-prototype pages.
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
