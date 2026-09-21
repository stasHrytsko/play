import { expect, test } from '@playwright/test';
import { GAME } from '../../game.config.ts';
import { GAME_PATH, openLevelSelect, testId } from './helpers.ts';

/**
 * The shell's own behaviour is proven once, in games/tap-targets. What is
 * worth re-proving per game is the part that is this game's: its page builds,
 * its onboarding is its own, and its mechanic mounts and tears down a whole
 * Phaser.Game around a level.
 */
test.describe('shell', () => {
  test('opens on this game, not on the template', async ({ page }) => {
    await page.goto(GAME_PATH);
    await expect(testId(page, 'game-title')).toHaveText(GAME.title);
    await expect(testId(page, 'play')).toBeVisible();
  });

  test('does not scroll horizontally on a phone viewport', async ({ page }) => {
    await page.goto(GAME_PATH);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('shows this game rules on the first run and skips them afterwards', async ({ page }) => {
    await openLevelSelect(page);

    await testId(page, 'levels-back').click();
    await testId(page, 'play').click();
    await expect(testId(page, 'level-select')).toBeVisible();
    await expect(testId(page, 'onboarding')).toBeHidden();
  });

  test('mounts the plate and tears it down with the level', async ({ page }) => {
    await openLevelSelect(page);
    await testId(page, 'level-1').click();

    await expect(testId(page, 'game-surface').locator('canvas')).toBeVisible();
    await expect(testId(page, 'active-boxes')).toBeVisible();
    await expect(testId(page, 'pocket')).toBeVisible();

    // Two ways the plate can be wrong while everything else looks right, both
    // of them shipped once during the build of this game: the CSS can collapse
    // it (the canvas came out 4px tall, every screw stacked into a line), and
    // Phaser can keep the size it measured before the dock rendered (the canvas
    // outgrew its box and the bottom row of screws was drawn below it). A
    // floor and a fit catch both, and neither shows up in a unit test.
    const canvas = await testId(page, 'game-surface').locator('canvas').boundingBox();
    const plate = await testId(page, 'box-arrives-board').boundingBox();
    expect(canvas?.height ?? 0).toBeGreaterThan(240);
    expect(canvas?.width ?? 0).toBeGreaterThan(240);
    expect(Math.abs((canvas?.height ?? 0) - (plate?.height ?? 0))).toBeLessThan(4);
    expect(Math.abs((canvas?.width ?? 0) - (plate?.width ?? 0))).toBeLessThan(4);

    await testId(page, 'game-back').click();
    await expect(testId(page, 'level-select')).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
  });
});
