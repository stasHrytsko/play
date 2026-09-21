import { gunzipSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';
import { GAME } from '../../game.config.ts';
import { losingLine } from '../lines.ts';
import { clearCurrentLevel, GAME_PATH, openLevelSelect, tapScrew, testId } from './helpers.ts';
import { levelAt, LEVELS } from './levelPack.ts';

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
  // its check ends on `!!navigator.webdriver`, which Playwright sets on every
  // page. Turning the filter off in PostHogSignalSink instead would disable
  // bot filtering in production, and an experiment judged on real player
  // numbers cannot afford crawler traffic in its funnel.
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
  // 83 real taps on a real canvas across five level mounts.
  test.setTimeout(240_000);

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
    await testId(page, 'rating-comment').fill('Карман на третьем уровне решает всё');
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
    expect(signals.feedback).toEqual([
      expect.objectContaining({ game_id: GAME.id, comment: 'Карман на третьем уровне решает всё' }),
    ]);

    // Nothing was lost on the way through — the whole run is a win line.
    expect(signals.posthog.some((signal) => signal.event === 'level_fail')).toBe(false);

    for (let index = 1; index <= GAME.levelCount; index += 1) {
      await expect(testId(page, `level-${String(index)}`)).toHaveAttribute('data-state', 'completed');
    }
  });

  test('an overflowing pocket loses the level and reports the reason', async ({ page }) => {
    const signals = await captureSignals(page);

    // Level 4, tapped in the order the screws happen to be drawn — the line a
    // player takes when they ignore the queue. The engine says it overflows
    // the pocket on the ninth tap (tests/levels.test.ts); this proves the
    // screen agrees, and that the loss reaches the funnel as a reason code.
    const level = levelAt(3);
    const line = losingLine(level);
    expect(line.state.failReason).toBe('pocket_overflow');

    await seedProgress(page, [0, 1, 2], GAME.onboarding.version);
    await page.goto(GAME_PATH);
    await testId(page, 'play').click();
    await testId(page, 'level-4').click();

    const hud = testId(page, 'mechanic-hud');
    await expect(hud).toHaveAttribute('data-remaining', String(level.screws.length));

    for (const screwId of line.taps) {
      await tapScrew(page, level, screwId);
    }

    await expect(testId(page, 'fail-popup')).toBeVisible();
    await expect(hud).toHaveAttribute('data-pocket', String(level.pocketSize));

    await expect
      .poll(() => signals.posthog.map((signal) => signal.event), { timeout: 15_000 })
      .toContain('level_fail');

    expect(signals.posthog).toContainEqual({
      event: 'level_fail',
      properties: expect.objectContaining({
        game_id: GAME.id,
        level: 3,
        reason: 'pocket_overflow',
      }),
    });

    // Retry puts the level back as it was, screws and pocket alike.
    await testId(page, 'retry-level').click();
    await expect(testId(page, 'fail-popup')).toBeHidden();
    await expect(hud).toHaveAttribute('data-remaining', String(level.screws.length));
    await expect(hud).toHaveAttribute('data-pocket', '0');
  });

  test('the box pair shifts every third move and empties what it now accepts', async ({ page }) => {
    // The twist, on screen: a colour with nowhere to go waits in the pocket,
    // and the shift three moves later takes it. If this ever stops holding,
    // the pocket is a punishment with no release and the game is a different
    // one (spec §3.9, §3.10).
    const level = levelAt(0);
    // After a shift the pair is [the old right box, the head of the queue].
    const shiftedPair = level.boxes.slice(1, 3).join(',');

    await openLevelSelect(page);
    await testId(page, 'level-1').click();

    const hud = testId(page, 'mechanic-hud');
    await expect(hud).toHaveAttribute('data-until-shift', String(level.shiftEvery));
    await expect(hud).toHaveAttribute('data-pocket', '0');
    await expect(hud).toHaveAttribute('data-active', level.boxes.slice(0, 2).join(','));

    // l1s4 is the odd colour out — no box takes it yet, so it goes to the pocket.
    await tapScrew(page, level, 'l1s4');
    await expect(hud).toHaveAttribute('data-pocket', '1');
    await expect(hud).toHaveAttribute('data-until-shift', String(level.shiftEvery - 1));
    await expect(hud).toHaveAttribute('data-shifted', 'no');

    // Two screws the boxes do take: the pocket stays as it is, the counter runs down.
    await tapScrew(page, level, 'l1s3');
    await expect(hud).toHaveAttribute('data-pocket', '1');
    await tapScrew(page, level, 'l1s6');

    await expect(hud).toHaveAttribute('data-shifted', 'yes');
    await expect(hud).toHaveAttribute('data-pocket', '0');
    await expect(hud).toHaveAttribute('data-until-shift', String(level.shiftEvery));
    await expect(hud).toHaveAttribute('data-active', shiftedPair);
  });
});
