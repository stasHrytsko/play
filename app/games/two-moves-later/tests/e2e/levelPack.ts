import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Level } from '../../mechanic/engine/types.ts';

interface LevelPack {
  readonly schemaVersion: number;
  readonly levels: readonly Level[];
}

const packPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../mechanic/levels/levels.json',
);

export const LEVELS: readonly Level[] = (
  JSON.parse(readFileSync(packPath, 'utf8')) as LevelPack
).levels;
