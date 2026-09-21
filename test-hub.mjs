import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';

const hubSource = readFileSync(new URL('./hub.js', import.meta.url), 'utf8');

class FixedDate extends Date {
  constructor(...args) {
    super(...(args.length ? args : ['2026-09-30T12:00:00Z']));
  }
}

/**
 * Один прогон hub.js в изолированном контексте. Параметры — то, чем один
 * прогон отличается от другого: адрес страницы и настроен ли PostHog.
 */
function run({ hostname = 'play.hrytsko.com', search = '', posthog = { projectToken: '', apiHost: '' } } = {}) {
  const stored = new Map();
  const listeners = {};
  const upcomingLabel = { textContent: 'Next release' };
  const upcoming = {
    dataset: { releaseDate: '2026-10-01' },
    querySelector: () => upcomingLabel
  };
  const analyticsToggle = { hidden: false, addEventListener() {} };
  const scripts = [];

  const document = {
    referrer: 'https://www.linkedin.com/feed/',
    body: { dataset: {} },
    addEventListener: (type, listener) => { listeners[type] = listener; },
    querySelector: (selector) => ({
      '[data-upcoming-card]': upcoming,
      '[data-analytics-toggle]': analyticsToggle
    })[selector] || null,
    // Загрузчик posthog-js вставляет <script> — по нему и видно, дошло ли
    // дело до установки, ничего не отправляя по сети.
    createElement: () => ({ type: '', crossOrigin: '', async: false, src: '' }),
    getElementsByTagName: () => [{ parentNode: { insertBefore: (node) => scripts.push(node) } }]
  };

  const window = {
    PVP_CONFIG: { startDate: '2026-10-01', timeZone: 'Europe/Madrid', posthog },
    location: {
      origin: `https://${hostname}`,
      hostname,
      pathname: '/',
      search,
      reload() {}
    },
    localStorage: {
      getItem: (key) => stored.get(key) || null,
      setItem: (key, value) => stored.set(key, value)
    },
    crypto: webcrypto
  };

  vm.runInNewContext(hubSource, {
    window,
    document,
    URL,
    URLSearchParams,
    Intl,
    Date: FixedDate,
    Uint32Array
  });
  listeners.DOMContentLoaded();

  return { window, stored, upcomingLabel, analyticsToggle, installed: scripts.length > 0 };
}

const check = (condition, message) => {
  if (!condition) throw new Error(message);
};

// --- Поведение страницы -----------------------------------------------------

const base = run({ search: '?utm_source=linkedin&utm_medium=social&utm_campaign=launch' });

const attribution = JSON.parse(base.stored.get('pvp_attribution_v1'));
check(attribution.firstTouch.utm_source === 'linkedin', 'UTM source was not persisted');
check(attribution.firstTouch.utm_medium === 'social', 'UTM medium was not persisted');
check(typeof base.window.pvpTrack === 'function', 'Tracking adapter was not exposed');
check(base.analyticsToggle.hidden, 'Analytics control must stay hidden until PostHog is configured');
check(base.upcomingLabel.textContent === 'Tomorrow', 'Upcoming card was not labelled Tomorrow');

// --- Откуда уходят события --------------------------------------------------

// Хаб шлёт верх воронки (hub_impression, hub_click), по которой читается
// вердикт. С локального сервера, с превью-деплоя и из прогонов события
// завышали бы «открытия» и занижали долю дошедших — ту самую цифру, ради
// которой всё считается. Зеркало app/src/shell/reporting.ts.
const posthog = { projectToken: 'phc_test', apiHost: 'https://eu.i.posthog.com' };

check(run({ posthog }).installed, 'Hub must report from its own domain');
check(!run({ hostname: 'localhost', posthog }).installed, 'Hub must stay silent on localhost');
check(
  !run({ hostname: 'play-git-main-stas-projects.vercel.app', posthog }).installed,
  'Hub must stay silent on a preview deployment'
);
check(
  run({ hostname: 'localhost', search: '?signals=on', posthog }).installed,
  '?signals=on must turn reporting on anywhere'
);
check(
  !run({ search: '?signals=off', posthog }).installed,
  '?signals=off must silence a visit that should not count'
);

console.log('hub behavior checks passed: UTM persistence, Tomorrow label, tracking adapter, reporting host');
