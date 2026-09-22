import { expect, test } from '@playwright/test';
import { LEVEL_ONE_SOLUTION } from '../solution.ts';
import { LEVELS } from './levelPack.ts';
import { openLevel, playAuthoredSolution, swipeCell, testId } from './helpers.ts';

test.describe('Taxi Slide playthrough', () => {
  test.setTimeout(60_000);

  test('invalid swipe spends no move, the recorded route delivers everyone', async ({ page }) => {
    await openLevel(page);
    const hud = testId(page, 'mechanic-hud');
    const passengers = LEVELS[0]?.passengers.length ?? 0;
    await expect(hud).toHaveAttribute('data-passengers-left', String(passengers));

    const edgeTaxi = LEVELS[0]?.taxis.find((taxi) => taxi.row === 0);
    if (edgeTaxi === undefined) throw new Error('Level one needs a taxi on the top row.');
    await swipeCell(page, edgeTaxi, { row: -1, col: edgeTaxi.col });
    await expect(hud).toHaveAttribute('data-moves', '0');

    const finalState = await playAuthoredSolution(page);
    expect(finalState.status).toBe('won');
    await expect(hud).toHaveAttribute('data-passengers-left', '0');
    await expect(testId(page, 'win-popup')).toBeVisible();
  });

  test('undo steps back one swipe, restart goes back to the opening layout', async ({ page }) => {
    await openLevel(page);
    const hud = testId(page, 'mechanic-hud');
    const undo = testId(page, 'undo-move');
    const restart = testId(page, 'restart-level');
    await expect(undo).toBeDisabled();

    const first = LEVEL_ONE_SOLUTION[0];
    const taxi = LEVELS[0]?.taxis.find((candidate) => candidate.id === first?.taxiId);
    if (first === undefined || taxi === undefined) throw new Error('Missing the first recorded move.');
    await swipeCell(page, taxi, first);
    await expect(hud).toHaveAttribute('data-moves', '1');
    await page.waitForTimeout(500);

    await undo.click();
    await expect(hud).toHaveAttribute('data-moves', '0');
    await expect(undo).toBeDisabled();

    await swipeCell(page, taxi, first);
    await expect(hud).toHaveAttribute('data-moves', '1');
    await page.waitForTimeout(500);
    await restart.click();
    await expect(hud).toHaveAttribute('data-moves', '0');
    await expect(hud).toHaveAttribute('data-passengers-left', String(LEVELS[0]?.passengers.length));
  });

  test('the grid icon leaves for the level list', async ({ page }) => {
    await openLevel(page);
    await testId(page, 'mechanic-exit').click();
    await expect(testId(page, 'level-4')).toBeVisible();
  });
});
