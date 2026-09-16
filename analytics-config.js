// PostHog Project API tokens are intended for client-side use. Do not put a
// personal API key here. Copy the project token and regional host from the
// PostHog project settings when the project is ready to collect events.
window.PVP_CONFIG = Object.freeze({
  startDate: '2026-10-01',
  timeZone: 'Europe/Madrid',
  posthog: Object.freeze({
    projectToken: 'phc_uT9HfgYBxEeHxK2FP9LFJY5ct5ZBtPFD2znLAxPCRFDL',
    apiHost: 'https://eu.i.posthog.com',
    defaults: '2026-05-30'
  })
});
