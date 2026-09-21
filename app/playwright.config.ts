import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

/**
 * testDir is the repo root's games/ folder rather than one tests/e2e: every
 * game keeps its own E2E specs at games/<slug>/tests/e2e (docs/decisions.md,
 * 2026-09-16), auto-discovered here by testMatch instead of listed by hand.
 */
export default defineConfig({
  testDir: './games',
  testMatch: '**/tests/e2e/**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'mobile-web',
      // Web-first for the 30/30 experiment; a phone viewport is still the
      // right default since every game is played on a phone browser.
      //
      // channel: 'chromium' runs the full Chromium build instead of the
      // headless shell Playwright picks by default. The shell reports
      // "HeadlessChrome" in navigator.userAgentData.brands, and posthog-js
      // treats that as a bot and silently discards every capture — so the
      // analytics assertions can only pass in a browser that looks like the
      // one players actually use.
      use: { ...devices['Pixel 7'], channel: 'chromium' },
    },
  ],
  webServer: {
    // Run E2E against the production bundle, not the dev server.
    command: 'npm run build && npm run preview',
    // Wait for the port to accept connections, not for an HTTP status on `/`.
    // Readiness here is a TCP question: each spec navigates to its own game
    // path, and the root is only the lab's index page (public/index.html) —
    // nothing the suite depends on.
    port: PORT,
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  },
});
