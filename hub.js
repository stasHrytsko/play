(() => {
  'use strict';

  const config = window.PVP_CONFIG || {};
  const attributionKey = 'pvp_attribution_v1';
  const optOutKey = 'pvp_analytics_opt_out';
  const utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

  function readJson(key) {
    try {
      return JSON.parse(window.localStorage.getItem(key) || 'null');
    } catch {
      return null;
    }
  }

  function writeJson(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Analytics must never block the site when storage is unavailable.
    }
  }

  function trafficSource(touch = {}) {
    if (touch.utm_source) return touch.utm_source;
    if (touch.referrer) {
      try {
        return new URL(touch.referrer).hostname.replace(/^www\./, '');
      } catch {
        return 'referral';
      }
    }
    return 'direct';
  }

  function captureAttribution() {
    const query = new URLSearchParams(window.location.search);
    const utm = {};
    utmKeys.forEach((key) => {
      const value = query.get(key);
      if (value) utm[key] = value.slice(0, 200);
    });

    const previous = readJson(attributionKey) || {};
    const hasCampaign = Object.keys(utm).length > 0;
    let hasExternalReferrer = false;
    if (document.referrer) {
      try {
        hasExternalReferrer = new URL(document.referrer).origin !== window.location.origin;
      } catch {
        hasExternalReferrer = true;
      }
    }

    if (!hasCampaign && !hasExternalReferrer && previous.firstTouch) return previous;

    const touch = {
      ...utm,
      referrer: hasExternalReferrer ? document.referrer : '',
      landingPage: `${window.location.pathname}${window.location.search}`,
      capturedAt: new Date().toISOString()
    };
    const next = {
      firstTouch: previous.firstTouch || touch,
      lastTouch: touch
    };
    writeJson(attributionKey, next);
    return next;
  }

  const attribution = captureAttribution();

  function eventProperties(extra = {}) {
    const first = attribution.firstTouch || {};
    const last = attribution.lastTouch || first;
    const properties = {
      project: 'prototype_validation_project',
      page_path: window.location.pathname,
      traffic_source: trafficSource(first),
      first_referrer: first.referrer || 'direct',
      latest_referrer: last.referrer || 'direct',
      ...extra
    };

    utmKeys.forEach((key) => {
      if (first[key]) properties[`first_${key}`] = first[key];
      if (last[key]) properties[`latest_${key}`] = last[key];
    });
    return properties;
  }

  function installPostHog(projectToken, apiHost, defaults) {
    !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split('.');2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement('script')).type='text/javascript',p.crossOrigin='anonymous',p.async=!0,p.src=s.api_host.replace('.i.posthog.com','-assets.i.posthog.com')+'/static/array.js',(r=t.getElementsByTagName('script')[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a='posthog',u.people=u.people||[],Object.defineProperty(u,'toString',{configurable:!0,enumerable:!0,writable:!0,value:function(t){var e='posthog';return'posthog'!==a&&(e+='.'+a),t||(e+=' (stub)'),e}}),Object.defineProperty(u.people,'toString',{configurable:!0,enumerable:!0,writable:!0,value:function(){return u.toString(1)+'.people (stub)'}}),o='init capture opt_in_capturing opt_out_capturing has_opted_out_capturing'.split(' '),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

    window.posthog.init(projectToken, {
      api_host: apiHost,
      defaults,
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
      person_profiles: 'identified_only',
      persistence: 'localStorage'
    });
  }

  const analyticsConfigured = Boolean(config.posthog?.projectToken && config.posthog?.apiHost);
  const analyticsOptedOut = readJson(optOutKey) === true;
  if (analyticsConfigured && !analyticsOptedOut) {
    installPostHog(config.posthog.projectToken, config.posthog.apiHost, config.posthog.defaults || '2026-05-30');
  }

  function track(name, extra = {}) {
    if (!analyticsConfigured || analyticsOptedOut || !window.posthog?.capture) return;
    window.posthog.capture(name, eventProperties(extra));
  }

  window.pvpTrack = track;

  function madridDateParts(date = new Date()) {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: config.timeZone || 'Europe/Madrid',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  function daysBetween(fromIso, toIso) {
    const from = Date.parse(`${fromIso}T12:00:00Z`);
    const to = Date.parse(`${toIso}T12:00:00Z`);
    return Math.round((to - from) / 86400000);
  }

  function updateUpcomingCard() {
    const card = document.querySelector('[data-upcoming-card]');
    const label = card?.querySelector('[data-upcoming-label]');
    if (!card || !label) return;
    const releaseDate = card.dataset.releaseDate;
    const remaining = daysBetween(madridDateParts(), releaseDate);
    if (remaining === 1) label.textContent = 'Tomorrow';
    else if (remaining === 0) label.textContent = 'Scheduled for today';
    else if (remaining < 0) label.textContent = 'Release pending';
  }

  function setupAnalyticsControl() {
    const button = document.querySelector('[data-analytics-toggle]');
    if (!button) return;
    if (!analyticsConfigured) {
      button.hidden = true;
      return;
    }
    button.hidden = false;
    button.textContent = analyticsOptedOut ? 'Enable analytics' : 'Opt out';
    button.addEventListener('click', () => {
      writeJson(optOutKey, !analyticsOptedOut);
      if (analyticsOptedOut) window.posthog?.opt_in_capturing?.();
      else window.posthog?.opt_out_capturing?.();
      window.location.reload();
    });
  }

  function setupTracking() {
    document.addEventListener('click', (event) => {
      const tracked = event.target.closest('[data-track]');
      if (!tracked) return;
      track(tracked.dataset.track, {
        prototype_id: tracked.dataset.prototypeId || document.body.dataset.prototypeId || null,
        prototype_slug: tracked.dataset.prototypeSlug || document.body.dataset.prototypeSlug || null
      });
    });
    track(document.body.dataset.prototypeId ? 'prototype_viewed' : 'hub_viewed', {
      prototype_id: document.body.dataset.prototypeId || null,
      prototype_slug: document.body.dataset.prototypeSlug || null
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    updateUpcomingCard();
    setupAnalyticsControl();
    setupTracking();
  });
})();
