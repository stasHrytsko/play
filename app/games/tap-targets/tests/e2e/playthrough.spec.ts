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
 * Intercepts the real network calls the real PostHogSignalSink and
 * Web3FormsFeedbackSink make. Nothing in src/ knows it is under test — no
 * test-only sink, no injected hook.
 *
 * posthog-js batches or sends single events depending on internals this test
 * should not have to track, so the body is parsed leniently: a bare `event`
 * field, or a `batch` array of `{event, properties}` entries.
 */
async function captureSignals(page: Page): Promise<{ posthog: CapturedEvent[]; feedback: unknown[] }> {
  const posthog: CapturedEvent[] = [];
  const feedback: unknown[] = [];

  await page.route('https://eu.i.posthog.com/**', async (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      try {
        const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
        const batch = Array.isArray(body['batch']) ? (body['batch'] as Record<string, unknown>[]) : [body];
        for (const entry of batch) {
          const event = entry['event'];
          if (typeof event === 'string') {
            posthog.push({ event, properties: (entry['properties'] as Record<string, unknown>) ?? {} });
          }
        }
      } catch {
        // Not JSON (e.g. a beacon ping) — nothing this test cares about.
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
