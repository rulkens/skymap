/**
 * regionRelativeDistanceMpc — the camera's distance from a region's ANCHOR: what
 * a region-scoped near-field band keys on. `hypot(camPos)` answers that only
 * while the anchor is the Sun at the render origin.
 *
 * An unresolved anchor — a region authored ahead of the seed that gives its
 * anchor a position — yields Infinity, not 0: the region-scoped bands are full
 * at their small-distance edge, so 0 would switch absent content fully ON.
 * Infinity sits at the off end and cannot pass for a real reading.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import type { BodyRegion } from '../../@types/scene/BodyRegion';
import type { BodyState } from '../../@types/scene/BodyState';
import { distanceMpc } from '../math/distanceMpc';

export function regionRelativeDistanceMpc(
  camPosMpc: Readonly<Vec3>,
  region: BodyRegion,
  states: ReadonlyMap<string, BodyState>,
): number {
  const anchor = states.get(region.anchorId);
  return anchor === undefined ? Infinity : distanceMpc(camPosMpc, anchor.positionMpc);
}
