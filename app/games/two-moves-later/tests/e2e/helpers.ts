import { expect, type Page } from '@playwright/test';
import { createState, resolveSwipe } from '../../mechanic/engine/taxiEngine.ts';
import type { Direction, LevelState } from '../../mechanic/engine/types.ts';
import { boardGeometry } from '../../mechanic/render/geometry.ts';
import { LEVEL_ONE_SOLUTION } from '../solution.ts';
import { LEVELS } from './levelPack.ts';

export const GAME_PATH = '/games/two-moves-later/?signals=off';

export function testId(page: Page, id: string) {
  return page.locator(`[data-testid="${id}"]`);
}

export async function openLevel(page: Page): Promise<void> {
  await page.goto(GAME_PATH);
  await testId(page, 'play').click();
  await expect(testId(page, 'onboarding')).toBeVisible();
  await testId(page, 'onboarding-continue').click();
  await testId(page, 'level-1').click();
  await expect(testId(page, 'mechanic-hud')).toHaveAttribute('data-moves', '0');
  await expect(testId(page, 'taxi-board').locator('canvas')).toBeVisible();
}

function direction(
  from: { row: number; col: number },
  to: { row: number; col: number },
): Direction {
  if (to.row < from.row) return 'up';
  if (to.row > from.row) return 'down';
  if (to.col < from.col) return 'left';
  return 'right';
}

export async function swipeCell(
  page: Page,
  from: { row: number; col: number },
  to: { row: number; col: number },
): Promise<void> {
  const canvas = testId(page, 'taxi-board').locator('canvas');
  const box = await canvas.boundingBox();
  if (box === null) throw new Error('Taxi canvas has no layout box.');
  const geometry = boardGeometry(box.width, box.height);
  const startX = box.x + geometry.x + (from.col + 0.5) * geometry.cell;
  const startY = box.y + geometry.y + (from.row + 0.5) * geometry.cell;
  const endX = box.x + geometry.x + (to.col + 0.5) * geometry.cell;
  const endY = box.y + geometry.y + (to.row + 0.5) * geometry.cell;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 5 });
  await page.mouse.up();
}

export async function playAuthoredSolution(page: Page): Promise<LevelState> {
  const level = LEVELS[0];
  if (level === undefined) throw new Error('Missing level one.');
  let state = createState(level);
  const hud = testId(page, 'mechanic-hud');

  for (let index = 0; index < LEVEL_ONE_SOLUTION.length; index += 1) {
    const move = LEVEL_ONE_SOLUTION[index];
    if (move === undefined) continue;
    const taxi = state.taxis.find((candidate) => candidate.id === move.taxiId);
    if (taxi === undefined) throw new Error(`Missing ${move.taxiId} at move ${String(index + 1)}.`);
    await swipeCell(page, taxi, move);
    const outcome = resolveSwipe(level, state, {
      type: 'swipe-taxi',
      taxiId: move.taxiId,
      direction: direction(taxi, move),
    });
    if (!outcome.valid) throw new Error(`Invalid authored move ${String(index + 1)}.`);
    state = outcome.state;
    await expect(hud).toHaveAttribute('data-moves', String(index + 1));
    // A pickup is move (135ms) → exit (180ms) → collapse (130ms).
    // Wait for input to unlock before starting the next real gesture.
    await page.waitForTimeout(520);
  }
  return state;
}
