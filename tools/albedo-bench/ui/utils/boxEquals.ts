import type { LonLatBounds } from '../../../../src/layers/body/surfaceTiles/format/@types/LonLatBounds';

export function boxEquals(a: LonLatBounds, b: LonLatBounds): boolean {
  return a.west === b.west && a.east === b.east && a.south === b.south && a.north === b.north;
}
