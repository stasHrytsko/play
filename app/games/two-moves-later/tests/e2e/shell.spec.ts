import { expect, test } from '@playwright/test';
import { openLevel, testId } from './helpers.ts';

test.describe('Taxi Slide mobile shell', () => {
  test('opens one level and fits the board inside a phone viewport', async ({ page }) => {
    await openLevel(page);
    await expect(testId(page, 'level-2')).toHaveCount(0);

    const board = testId(page, 'taxi-board');
    const canvas = board.locator('canvas');
    const boardBox = await board.boundingBox();
    const canvasBox = await canvas.boundingBox();
    expect(boardBox).not.toBeNull();
    expect(canvasBox).not.toBeNull();
    if (boardBox !== null && canvasBox !== null) {
      expect(canvasBox.width).toBeLessThanOrEqual(boardBox.width + 1);
      expect(canvasBox.height).toBeLessThanOrEqual(boardBox.height + 1);
      expect(canvasBox.height).toBeGreaterThan(240);
    }

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
