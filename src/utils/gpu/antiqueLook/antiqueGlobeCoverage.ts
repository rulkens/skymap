/**
 * antiqueGlobeCoverage — the share of the plate a globe covers, 0..1, from a
 * coarse grid of view rays cast at it in f64: what fades a globe's interior net
 * in, so a speck of a planet is not ruled and a whole globe is.
 */

import type { ViewBasis } from '../../../@types/camera/projection/ViewBasis';
import type { ViewFrustum } from '../../../@types/camera/projection/ViewFrustum';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { Size } from '../../../@types/rendering/Size';
import { rayThroughPx } from '../../camera/projection/rayThroughPx';

const COLUMNS = 16;
const ROWS = 9;

export function antiqueGlobeCoverage(
  centre: Readonly<Vec3>,
  basis: ViewBasis,
  frustum: ViewFrustum,
  size: Size,
): number {
  const d2 = centre[0] ** 2 + centre[1] ** 2 + centre[2] ** 2;
  let hits = 0;
  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i < COLUMNS; i++) {
      const px = [((i + 0.5) / COLUMNS) * size.width, ((j + 0.5) / ROWS) * size.height] as const;
      const r = rayThroughPx(px, basis, frustum, size);
      const along = (centre[0] * r[0] + centre[1] * r[1] + centre[2] * r[2]) / Math.hypot(...r);
      if (along > 0 && d2 - along * along < 1) hits++;
    }
  }
  return hits / (COLUMNS * ROWS);
}
