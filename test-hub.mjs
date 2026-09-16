import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';

const stored = new Map();
const listeners = {};
const upcomingLabel = { textContent: 'Next release' };
const upcoming = {
  dataset: { releaseDate: '2026-10-01' },
  querySelector: () => upcomingLabel
};
const analyticsToggle = { hidden: false, addEventListener() {} };
class FixedDate extends Date {
  constructor(...args) {
    super(...(args.length ? args : ['2026-09-30T12:00:00Z']));
  }
}
const document = {
  referrer: 'https://www.linkedin.com/feed/',
  body: { dataset: {} },
  addEventListener: (type, listener) => { listeners[type] = listener; },
  querySelector: (selector) => ({
    '[data-upcoming-card]': upcoming,
    '[data-analytics-toggle]': analyticsToggle
  })[selector] || null
};
const window = {
  PVP_CONFIG: {
    startDate: '2026-10-01',
    timeZone: 'Europe/Madrid',
    posthog: { projectToken: '', apiHost: '' }
  },
  location: {
    origin: 'https://play.hrytsko.com',
    pathname: '/',
    search: '?utm_source=linkedin&utm_medium=social&utm_campaign=launch',
    reload() {}
  },
  localStorage: {
    getItem: (key) => stored.get(key) || null,
    setItem: (key, value) => stored.set(key, value)
  },
  crypto: webcrypto
};

vm.runInNewContext(readFileSync(new URL('./hub.js', import.meta.url), 'utf8'), {
  window,
  document,
  URL,
  URLSearchParams,
  Intl,
  Date: FixedDate,
  Uint32Array
});
listeners.DOMContentLoaded();

const attribution = JSON.parse(stored.get('pvp_attribution_v1'));
if (attribution.firstTouch.utm_source !== 'linkedin') throw new Error('UTM source was not persisted');
if (attribution.firstTouch.utm_medium !== 'social') throw new Error('UTM medium was not persisted');
if (typeof window.pvpTrack !== 'function') throw new Error('Tracking adapter was not exposed');
if (!analyticsToggle.hidden) throw new Error('Analytics control must stay hidden until PostHog is configured');
if (upcomingLabel.textContent !== 'Tomorrow') throw new Error('Upcoming card was not labelled Tomorrow');

console.log('hub behavior checks passed: UTM persistence, Tomorrow label, tracking adapter');
