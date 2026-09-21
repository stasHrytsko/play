import { expect, type Page } from '@playwright/test';
import { LEVELS } from './levelPack.ts';

/**
 * Multi-page build: this game's built page lives at dist/games/tap-targets/.
 *
 * `?signals=on` because the shell reports only from the hub's own domain
 * (src/shell/reporting.ts) — a Playwright run must not land in the funnel the
 * experiment's verdict is read off. The flag is what this suite asserts
 * against: without it there would be no network calls to intercept.
 */
export const GAME_PATH = '/games/tap-targets/?signals=on';

export function testId(page: Page, id: string) {
  return page.locator(`[data-testid="${id}"]`);
}

/** Walk from a cold start to the level grid, dismissing the first-run onboarding. */
export async function openLevelSelect(page: Page): Promise<void> {
  await page.goto(GAME_PATH);
  await expect(testId(page, 'main-menu')).toBeVisible();

  await testId(page, 'play').click();
  await expect(testId(page, 'onboarding')).toBeVisible();

  await testId(page, 'onboarding-continue').click();
  await expect(testId(page, 'level-select')).toBeVisible();
}

/**
 * Clear every target of the level currently on screen by tapping the canvas at
 * the coordinates the level pack declares. Nothing here reaches into Phaser —
 * these are real pointer events on real pixels, which is the only way to prove
 * that touch input actually works.
 */
export async function clearCurrentLevel(page: Page, levelIndex: number): Promise<void> {
  const level = LEVELS[levelIndex];
  if (level === undefined) throw new Error(`No level at index ${String(levelIndex)}`);

  const canvas = testId(page, 'game-surface').locator('canvas');
  await expect(canvas).toBeVisible();

  const hud = testId(page, 'mechanic-hud');
  await expect(hud).toHaveAttribute('data-remaining', String(level.targets.length));

  for (let i = 0; i < level.targets.length; i += 1) {
    const target = level.targets[i];
    if (target === undefined) continue;

    const box = await canvas.boundingBox();
    if (box === null) throw new Error('Canvas has no layout box.');

    await page.mouse.click(box.x + target.x * box.width, box.y + target.y * box.height);
    await expect(hud).toHaveAttribute('data-remaining', String(level.targets.length - i - 1));
  }
}
