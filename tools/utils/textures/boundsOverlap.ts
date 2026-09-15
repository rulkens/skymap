import type { LonLatBounds } from '../../../src/@types/scene/LonLatBounds';

/** Do two lon/lat boxes share any area? Inclusive on the edges, because a
 *  lattice box's edges are posts a source may be the only one holding. */
export function boundsOverlap(a: LonLatBounds, b: LonLatBounds): boolean {
  return a.west <= b.east && a.east >= b.west && a.south <= b.north && a.north >= b.south;
}
