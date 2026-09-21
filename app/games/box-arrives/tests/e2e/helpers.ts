import { expect, type Page } from '@playwright/test';
import type { Level } from '../../mechanic/engine/types.ts';
import { winningLine } from '../lines.ts';
import { levelAt } from './levelPack.ts';

/**
 * Multi-page build: this game's built page lives at dist/games/box-arrives/.
 *
 * `?signals=on` because the shell reports only from the hub's own domain
 * (src/shell/reporting.ts) — a Playwright run must not land in the funnel the
 * experiment's verdict is read off. The flag is what this suite asserts
 * against: without it there would be no network calls to intercept.
 */
export const GAME_PATH = '/games/box-arrives/?signals=on';

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
 * Tap one screw where it is actually drawn. The scene places a screw at
 * (x * width, y * height) of the canvas, so the level pack's normalised
 * coordinates are the click target — nothing here reaches into Phaser, these
 * are real pointer events on real pixels.
 */
export async function tapScrew(page: Page, level: Level, screwId: string): Promise<void> {
  const screw = level.screws.find((candidate) => candidate.id === screwId);
  if (screw === undefined) throw new Error(`Level ${String(level.id)} has no screw ${screwId}`);

  const canvas = testId(page, 'game-surface').locator('canvas');
  const box = await canvas.boundingBox();
  if (box === null) throw new Error('Canvas has no layout box.');

  await page.mouse.click(box.x + screw.x * box.width, box.y + screw.y * box.height);
}

/**
 * Play the level currently on screen along its recorded winning line.
 *
 * The line matters: from level 3 on, tapping screws in the order they happen
 * to be drawn loses (tests/levels.test.ts pins that down), so a test that
 * clicked its way left to right would be testing a loss.
 */
export async function clearCurrentLevel(page: Page, levelIndex: number): Promise<void> {
  const level = levelAt(levelIndex);
  const line = winningLine(level);

  const canvas = testId(page, 'game-surface').locator('canvas');
  await expect(canvas).toBeVisible();

  const hud = testId(page, 'mechanic-hud');
  await expect(hud).toHaveAttribute('data-remaining', String(level.screws.length));

  for (let i = 0; i < line.length; i += 1) {
    const screwId = line[i];
    if (screwId === undefined) continue;

    await tapScrew(page, level, screwId);
    await expect(hud).toHaveAttribute('data-remaining', String(level.screws.length - i - 1));
  }
}
