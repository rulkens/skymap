/**
 * antiqueGlobeCastable — whether the plate may cast a globe as a sphere: not
 * from inside its relief, nor within ANTIQUE_PLATE_RELIEF_MARGIN of it when the
 * frame shows a horizon, where a sphere cast near the ground draws a false
 * horizon under the real skyline. A frame whose four corners all fall on the
 * globe has no horizon to get wrong, so a low map view over Earth still casts.
 */

import type { Vec3 } from '../../../@types/math/Vec3';
import { ANTIQUE_PLATE_RELIEF_MARGIN } from '../../../data/rendering/antiquePlateBodies';

export function antiqueGlobeCastable(input: {
  /** Eye → centre, in the globe's radii. */
  readonly centre: Readonly<Vec3>;
  /** The radius its sphere is drawn at. */
  readonly radiusM: number;
  /** Its highest peak's radius (`outerBoundRadiusM`). */
  readonly outerRadiusM: number;
  /** The frame's corner rays, world axes, unit length. */
  readonly cornerRays: readonly Readonly<Vec3>[];
}): boolean {
  const { centre: c, radiusM, outerRadiusM } = input;
  const d = Math.hypot(c[0], c[1], c[2]);
  if (d * radiusM < outerRadiusM) return false;
  if (d * radiusM >= outerRadiusM * ANTIQUE_PLATE_RELIEF_MARGIN) return true;
  // A ray meets the unit sphere ahead when its closest approach to the centre is under 1.
  return input.cornerRays.every((r) => {
    const along = c[0] * r[0] + c[1] * r[1] + c[2] * r[2];
    return along > 0 && d * d - along * along < 1;
  });
}
