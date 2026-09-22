import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SolutionMove } from './solver.ts';

export type { SolutionMove } from './solver.ts';

// Read from disk rather than imported: Playwright loads this file too, and its
// loader wants an import attribute on JSON that vitest does not.
const raw = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'solutions.json'), 'utf8'),
) as readonly { level: number; moves: readonly SolutionMove[] }[];

/** Winning routes found by generate-levels.ts, one per level, in pack order. */
export const SOLUTIONS: readonly (readonly SolutionMove[])[] = raw.map((entry) => entry.moves);

export const LEVEL_ONE_SOLUTION: readonly SolutionMove[] = SOLUTIONS[0] ?? [];
