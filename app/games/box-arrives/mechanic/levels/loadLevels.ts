import { GAME } from '../../game.config.ts';
import type { Level, Screw } from '../engine/types.ts';
import rawLevelPack from './levels.json';

export const LEVELS_SCHEMA_VERSION = 1;

/**
 * Levels are data, and data from a file is untrusted until it is checked —
 * the one place in the mechanic where `unknown` is the right type.
 *
 * Validation throws rather than repairing. A level pack that does not match
 * the game is a bug to fix at build time, not a condition to survive at
 * runtime.
 */

function asRecord(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) throw new Error(`${where} must be an object.`);
  return value as Record<string, unknown>;
}

function positiveInt(value: unknown, where: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error(`${where} must be a positive integer, got ${String(value)}.`);
  }
  return value;
}

function parseScrew(entry: unknown, where: string, seenIds: Set<string>): Screw {
  const screw = asRecord(entry, where);

  const id = screw['id'];
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error(`${where}.id must be a non-empty string.`);
  }
  if (seenIds.has(id)) throw new Error(`${where}.id ${JSON.stringify(id)} is not unique across the pack.`);
  seenIds.add(id);

  const color = screw['color'];
  if (typeof color !== 'string' || color.length === 0) {
    throw new Error(`${where}.color must be a non-empty string.`);
  }

  const x = screw['x'];
  const y = screw['y'];
  for (const [axis, value] of [
    ['x', x],
    ['y', y],
  ] as const) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error(`${where}.${axis} must be a number in [0, 1], got ${String(value)}.`);
    }
  }

  return { id, color, x: x as number, y: y as number };
}

export function parseLevelPack(raw: unknown, expectedLevelCount: number): Level[] {
  const pack = asRecord(raw, 'Level pack');

  if (pack['schemaVersion'] !== LEVELS_SCHEMA_VERSION) {
    throw new Error(
      `Level pack schemaVersion must be ${String(LEVELS_SCHEMA_VERSION)}, got ${String(pack['schemaVersion'])}.`,
    );
  }

  const levels = pack['levels'];
  if (!Array.isArray(levels)) throw new Error('Level pack must have a "levels" array.');
  if (levels.length !== expectedLevelCount) {
    throw new Error(
      `Level pack has ${String(levels.length)} levels but GameDefinition.levelCount is ${String(expectedLevelCount)}.`,
    );
  }

  const seenIds = new Set<string>();

  return levels.map((entry, index): Level => {
    const where = `levels[${String(index)}]`;
    const level = asRecord(entry, where);

    if (level['id'] !== index + 1) {
      throw new Error(`${where}.id must be ${String(index + 1)}, got ${String(level['id'])}.`);
    }

    const shiftEvery = positiveInt(level['shiftEvery'], `${where}.shiftEvery`);
    const pocketSize = positiveInt(level['pocketSize'], `${where}.pocketSize`);
    const queuePreview = positiveInt(level['queuePreview'], `${where}.queuePreview`);

    const rawScrews = level['screws'];
    if (!Array.isArray(rawScrews) || rawScrews.length === 0) {
      throw new Error(`${where}.screws must be a non-empty array.`);
    }
    const screws = rawScrews.map((screwEntry, screwIndex) =>
      parseScrew(screwEntry, `${where}.screws[${String(screwIndex)}]`, seenIds),
    );

    const rawBoxes = level['boxes'];
    if (!Array.isArray(rawBoxes)) throw new Error(`${where}.boxes must be an array.`);
    const boxes = rawBoxes.map((box, boxIndex): string => {
      if (typeof box !== 'string' || box.length === 0) {
        throw new Error(`${where}.boxes[${String(boxIndex)}] must be a non-empty string.`);
      }
      return box;
    });

    // The engine assumes the queue never runs dry mid-level: spec §3.9 says the
    // head of the queue arrives on every shift and says nothing about what
    // happens when there is no head. Rather than inventing a rule, the content
    // is required to make it unreachable — two active boxes plus one per shift
    // the screw count can trigger.
    const boxesNeeded = 2 + Math.ceil(screws.length / shiftEvery);
    if (boxes.length < boxesNeeded) {
      throw new Error(
        `${where}.boxes has ${String(boxes.length)} boxes but ${String(screws.length)} screws at ` +
          `shiftEvery ${String(shiftEvery)} need at least ${String(boxesNeeded)}.`,
      );
    }

    // A colour with no box anywhere in the pack can only ever go to the pocket
    // and never leave it — an unwinnable level that looks fine to the eye.
    const boxColors = new Set(boxes);
    for (const screw of screws) {
      if (!boxColors.has(screw.color)) {
        throw new Error(
          `${where}: screw ${JSON.stringify(screw.id)} has colour ${JSON.stringify(screw.color)}, ` +
            'which never arrives as a box — it could never leave the pocket.',
        );
      }
    }

    return { id: index + 1, shiftEvery, pocketSize, queuePreview, screws, boxes };
  });
}

/** Validated at module load: a broken level pack must fail loudly and early. */
export const LEVELS: readonly Level[] = parseLevelPack(rawLevelPack, GAME.levelCount);

export function getLevel(levelIndex: number): Level {
  const level = LEVELS[levelIndex];
  if (level === undefined) {
    throw new Error(`No level at index ${String(levelIndex)} (pack has ${String(LEVELS.length)}).`);
  }
  return level;
}
