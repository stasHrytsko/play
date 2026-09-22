export interface BoardGeometry {
  readonly x: number;
  readonly y: number;
  readonly side: number;
  readonly cell: number;
}

export function boardGeometry(width: number, height: number): BoardGeometry {
  // Leave enough room for the passenger disc outside any edge cell.
  const margin = Math.max(40, Math.min(width, height) * 0.13);
  const side = Math.max(150, Math.min(width - margin * 2, height - margin * 2));
  return {
    x: (width - side) / 2,
    y: (height - side) / 2,
    side,
    cell: side / 5,
  };
}
