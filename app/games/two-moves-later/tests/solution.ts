import type { Cell } from '../mechanic/engine/types.ts';

export interface SolutionMove extends Cell {
  readonly taxiId: string;
}

export const LEVEL_ONE_SOLUTION: readonly SolutionMove[] = [
  { taxiId: 'taxi-17', row: 4, col: 3 },
  { taxiId: 'taxi-18', row: 3, col: 3 },
  { taxiId: 'taxi-18', row: 4, col: 3 },
  { taxiId: 'taxi-22', row: 4, col: 3 },
  { taxiId: 'taxi-14', row: 3, col: 4 },
  { taxiId: 'taxi-14', row: 3, col: 3 },
  { taxiId: 'taxi-9', row: 2, col: 4 },
  { taxiId: 'taxi-9', row: 3, col: 4 },
  { taxiId: 'taxi-9', row: 4, col: 4 },
  { taxiId: 'taxi-5', row: 1, col: 4 },
  { taxiId: 'taxi-4', row: 0, col: 4 },
  { taxiId: 'taxi-8', row: 1, col: 4 },
  { taxiId: 'taxi-3', row: 0, col: 3 },
  { taxiId: 'taxi-13', row: 2, col: 4 },
  { taxiId: 'taxi-2', row: 0, col: 2 },
  { taxiId: 'taxi-14', row: 3, col: 4 },
  { taxiId: 'taxi-1', row: 0, col: 1 },
  { taxiId: 'taxi-22', row: 4, col: 4 },
  { taxiId: 'taxi-6', row: 0, col: 0 },
  { taxiId: 'taxi-7', row: 0, col: 1 },
  { taxiId: 'taxi-21', row: 4, col: 3 },
  { taxiId: 'taxi-10', row: 1, col: 0 },
  { taxiId: 'taxi-16', row: 4, col: 2 },
  { taxiId: 'taxi-11', row: 2, col: 0 },
  { taxiId: 'taxi-20', row: 4, col: 2 },
  { taxiId: 'taxi-15', row: 2, col: 0 },
  { taxiId: 'taxi-19', row: 4, col: 1 },
  { taxiId: 'taxi-12', row: 1, col: 2 },
  { taxiId: 'taxi-12', row: 0, col: 2 },
];
