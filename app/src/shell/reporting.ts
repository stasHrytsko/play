/**
 * Whether this page's events and feedback are real.
 *
 * Every build of every game ships the same PostHog token, so until now a
 * playthrough from a dev server, a Playwright run or a preview deployment
 * landed in the same funnel as a real player's — and the experiment's verdict
 * is read off that funnel. One test play is noise; thirty prototypes' worth of
 * test plays is a wrong verdict.
 *
 * The decision is made from the address bar rather than from a build-time
 * variable on purpose: an env var has to be set correctly on every host that
 * ever serves this bundle, and the one place it gets forgotten is the one that
 * pollutes the data. The hub's own domain is the only place a player can be.
 */

/**
 * The hub. Only a game served from here has real players in front of it.
 *
 * The same constant and the same two flags live in the hub's own `hub.js`,
 * which sends hub_impression and hub_click from a dependency-free static page
 * with no bundler and no module to share. Two copies on purpose; a domain move
 * edits both, and each names the other.
 */
export const REPORTING_HOST = 'play.hrytsko.com';

/**
 * `?signals=on` turns reporting on anywhere — the E2E suite asserts the real
 * network calls, and a manual check of the funnel needs the same. It can only
 * add the viewer's own events, never silence anyone else's.
 *
 * `?signals=off` is the other direction: a play on the hub that must not count
 * (a demo, a screenshot run, showing the game to someone over your shoulder).
 */
export function reportingEnabled(location: Pick<Location, 'hostname' | 'search'>): boolean {
  const flag = new URLSearchParams(location.search).get('signals');
  if (flag === 'on') return true;
  if (flag === 'off') return false;
  return location.hostname === REPORTING_HOST;
}
