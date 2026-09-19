import { gunzipSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';
import { GAME } from '../../game.config.ts';
import { clearCurrentLevel, GAME_PATH, openLevelSelect, testId } from './helpers.ts';
import { LEVELS } from './levelPack.ts';

/** Mirrors @capacitor/preferences' web fallback, which stores under this key. */
const STORAGE_KEY = `CapacitorStorage.progress:${GAME.id}`;

interface CapturedEvent {
  event: string;
  properties: Record<string, unknown>;
}

/**
 * posthog-js never puts raw JSON on the wire. Depending on the compression it
 * negotiates, the body is either `data=<url-encoded base64 of the JSON>` with
 * an x-www-form-urlencoded content type, or a gzip blob (posthog-js/dist:
 * `"data="+encodeURIComponent(...)` for Base64, `gzip-js` otherwise).
 *
 * Reading it as JSON therefore always threw, the throw was swallowed, and
 * every assertion below saw an empty array — which is exactly how these two
 * tests failed for as long as they existed.
 */
function decodeEvents(body: Buffer | null): Record<string, unknown>[] {
  if (body === null || body.length === 0) return [];

  let text: string;
  if (body[0] === 0x1f && body[1] === 0x8b) {
    try {
      text = gunzipSync(body).toString('utf8');
    } catch {
      return [];
    }
  } else {
    const raw = body.toString('utf8');
    if (raw.startsWith('data=')) {
      const payload = decodeURIComponent(raw.slice('data='.length));
      const decoded = Buffer.from(payload, 'base64').toString('utf8');
      // `data=` carries base64 in the Base64 mode and plain JSON in others.
      text = decoded.trimStart().startsWith('{') || decoded.trimStart().startsWith('[') ? decoded : payload;
    } else {
      text = raw;
    }
  }

  try {
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed as Record<string, unknown>[];
    const object = parsed as Record<string, unknown>;
    const batch = object['batch'];
    return Array.isArray(batch) ? (batch as Record<string, unknown>[]) : [object];
  } catch {
    // Not an event payload (e.g. the /flags/ handshake) — nothing to collect.
    return [];
  }
}

/**
 * Intercepts the real network calls the real PostHogSignalSink and
 * Web3FormsFeedbackSink make. Nothing in src/ knows it is under test — no
 * test-only sink, no injected hook.
 */
async function captureSignals(page: Page): Promise<{ posthog: CapturedEvent[]; feedback: unknown[] }> {
  const posthog: CapturedEvent[] = [];
  const feedback: unknown[] = [];

  // posthog-js drops every capture when it decides the viewer is a bot, and
  // its check ends on `!!navigator.webdriver` (posthog-js/dist), which
  // Playwright sets on every page. The events were therefore never sent —
  // not mis-encoded, not slow, simply discarded before the network.
  //
  // The override belongs here and not in PostHogSignalSink: turning
  // `opt_out_useragent_filter` on in the shell would disable bot filtering in
  // production too, and an experiment judged on real player numbers cannot
  // afford crawler traffic in its funnel.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  await page.route('https://eu.i.posthog.com/**', async (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      for (const entry of decodeEvents(request.postDataBuffer())) {
        const event = entry['event'];
        if (typeof event === 'string') {
          posthog.push({ event, properties: (entry['properties'] as Record<string, unknown>) ?? {} });
        }
      }
    }
    await route.fulfill({ status: 200, body: '{"status":1}' });
  });

  await page.route('https://api.web3forms.com/submit', async (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      feedback.push(JSON.parse(request.postData() ?? '{}'));
    }
    await route.fulfill({ status: 200, body: '{"success":true}' });
  });

  return { posthog, feedback };
}

async function seedProgress(page: Page, completedLevels: number[], onboardingVersion: number) {
  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key as string, value as string);
    },
    [
      STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 2,
        onboardingVersion,
        completedLevels,
        ratingAsked: false,
      }),
    ],
  );
}

test.describe('playthrough', () => {
  // Real taps on a real canvas across five level mounts.
  test.setTimeout(180_000);

  test('every level, then rating with a comment', async ({ page }) => {
    const signals = await captureSignals(page);

    await openLevelSelect(page);
    await testId(page, 'level-1').click();

    for (let index = 0; index < LEVELS.length; index += 1) {
      await clearCurrentLevel(page, index);

      if (index < LEVELS.length - 1) {
        await expect(testId(page, 'win-popup')).toBeVisible();
        await testId(page, 'next-level').click();
      }
    }

    // The last level ends with the rating popup, not the usual win popup.
    await expect(testId(page, 'rating-popup')).toBeVisible();
    await expect(testId(page, 'win-popup')).toBeHidden();

    // Nothing submitted yet — the button stays disabled until a star is picked.
    await expect(testId(page, 'rating-submit')).toBeDisabled();

    await testId(page, 'rating-star-4').click();
    await testId(page, 'rating-comment').fill('Уровень 4 сложнее, чем 5-й');
    await testId(page, 'rating-submit').click();

    await expect(testId(page, 'level-select')).toBeVisible();

    // posthog-js batches: a capture is queued when the popup closes and only
    // leaves the browser a moment later. Reading the array once races the
    // flush, so the wait is part of the assertion.
    await expect
      .poll(() => signals.posthog.map((signal) => signal.event), { timeout: 15_000 })
      .toEqual(
        expect.arrayContaining(['first_action', 'level_5_complete', 'rating_submit', 'comment_submit']),
      );

    expect(signals.posthog).toContainEqual({
      event: 'first_action',
      properties: expect.objectContaining({ game_id: GAME.id, level: 0 }),
    });
    expect(signals.posthog).toContainEqual({
      event: 'level_5_complete',
      properties: expect.objectContaining({ game_id: GAME.id }),
    });
    expect(signals.posthog).toContainEqual({
      event: 'rating_submit',
      properties: expect.objectContaining({ game_id: GAME.id, rating: 4 }),
    });
    expect(signals.posthog).toContainEqual({
      event: 'comment_submit',
      properties: expect.objectContaining({ game_id: GAME.id }),
    });
    expect(signals.feedback).toEqual([
      expect.objectContaining({ game_id: GAME.id, comment: 'Уровень 4 сложнее, чем 5-й' }),
    ]);

    // Every level is marked solved on the grid, and it is a plain vertical
    // list — no difficulty bands.
    for (let index = 1; index <= GAME.levelCount; index += 1) {
      await expect(testId(page, `level-${String(index)}`)).toHaveAttribute('data-state', 'completed');
    }
  });

  test('rating without a comment sends rating_submit but no comment_submit or email', async ({ page }) => {
    const signals = await captureSignals(page);

    // Start one level short of the end so this stays a focused test.
    const lastIndex = GAME.levelCount - 1;
    await seedProgress(
      page,
      Array.from({ length: lastIndex }, (_, index) => index),
      GAME.onboarding.version,
    );

    await page.goto(GAME_PATH);
    await testId(page, 'play').click();
    await testId(page, `level-${String(GAME.levelCount)}`).click();
    await clearCurrentLevel(page, lastIndex);

    await expect(testId(page, 'rating-popup')).toBeVisible();
    await testId(page, 'rating-star-2').click();
    await testId(page, 'rating-submit').click();
    await expect(testId(page, 'level-select')).toBeVisible();

    await expect
      .poll(() => signals.posthog.map((signal) => signal.event), { timeout: 15_000 })
      .toContain('rating_submit');

    expect(signals.posthog).toContainEqual({
      event: 'rating_submit',
      properties: expect.objectContaining({ game_id: GAME.id, rating: 2 }),
    });
    expect(signals.posthog.some((s) => s.event === 'comment_submit')).toBe(false);
    expect(signals.feedback).toEqual([]);
  });

  test('progress survives a full reload', async ({ page }) => {
    await openLevelSelect(page);
    await testId(page, 'level-1').click();
    await clearCurrentLevel(page, 0);
    await expect(testId(page, 'win-popup')).toBeVisible();
    await testId(page, 'to-levels').click();

    await page.reload();
    await testId(page, 'play').click();

    await expect(testId(page, 'level-1')).toHaveAttribute('data-state', 'completed');
    await expect(testId(page, 'level-2')).toHaveAttribute('data-state', 'unlocked');
  });
});
