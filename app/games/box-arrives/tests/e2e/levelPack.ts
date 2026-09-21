import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Level } from '../../mechanic/engine/types.ts';

interface LevelPack {
  schemaVersion: number;
  levels: Level[];
}

const packPath = join(dirname(fileURLToPath(import.meta.url)), '../../mechanic/levels/levels.json');

/**
 * The E2E suite taps real pixels on a real canvas, so it needs the screws'
 * coordinates and colours. Reading the same JSON the game ships keeps the test
 * honest: change the levels and the test follows automatically.
 *
 * Read from disk rather than imported: mechanic/levels/loadLevels.ts imports
 * the JSON as a module, which Playwright's transform does not resolve, and the
 * validation it performs is the unit tests' subject anyway.
 */
export const LEVELS: readonly Level[] = (JSON.parse(readFileSync(packPath, 'utf8')) as LevelPack).levels;

export function levelAt(index: number): Level {
  const level = LEVELS[index];
  if (level === undefined) throw new Error(`No level at index ${String(index)}`);
  return level;
}
