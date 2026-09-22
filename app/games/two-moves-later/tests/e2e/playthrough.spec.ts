import { expect, test } from '@playwright/test';
import { openLevel, playAuthoredSolution, swipeCell, testId } from './helpers.ts';

test.describe('Taxi Slide playthrough', () => {
  test.setTimeout(60_000);

  test('invalid swipe spends no move, authored route clears the field', async ({ page }) => {
    await openLevel(page);
    const hud = testId(page, 'mechanic-hud');

    await swipeCell(page, { row: 0, col: 0 }, { row: -1, col: 0 });
    await expect(hud).toHaveAttribute('data-moves', '0');
    await expect(hud).toHaveAttribute('data-remaining', '22');

    const finalState = await playAuthoredSolution(page);
    expect(finalState.status).toBe('won');
    await expect(hud).toHaveAttribute('data-remaining', '0');
    await expect(hud).toHaveAttribute('data-served', '22');
    await expect(testId(page, 'rating-popup')).toBeVisible();
  });
});
