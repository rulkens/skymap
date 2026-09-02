/**
 * blendedUpDir — THE reference-up field (ruling 10, one home): the normalized
 * blend of the pole's and the scene up's projections into the given plane,
 * `w·pole_⊥ + (1−w)·sceneUp_⊥`. Any continuous field between two fixed axes
 * has a singular locus (topology, not construction); where the terms are
 * present but CANCELLING, `carryUp` — the pose's own screen-up — stands in,
 * so the field is continuous along the path (hold-and-transport, round 7).
 * `null` = degenerate with nothing to carry; each caller owns its fallback.
 * Both arms read THIS — the engaged settle in the horizontal plane, the
 * world-arm roll target in the image plane — so their targets cannot diverge.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import { normalize3 } from '../math/normalize3';

/**
 * `|blend| / (w·|pole_⊥| + (1−w)·|sceneUp_⊥|)` below this ⇒ the terms are
 * cancelling and the direction is a coin flip — hold the carry instead.
 * Structural, not feel-tunable: it marks where the maths stops meaning.
 */
const HOLD_CONDITIONING = 0.3;

function planePart(v: Readonly<Vec3>, normal: Readonly<Vec3>): Vec3 {
  const vert = v[0] * normal[0] + v[1] * normal[1] + v[2] * normal[2];
  return [v[0] - normal[0] * vert, v[1] - normal[1] * vert, v[2] - normal[2] * vert];
}

export function blendedUpDir(
  planeNormal: Readonly<Vec3>,
  poleAxis: Readonly<Vec3>,
  blendW: number,
  sceneUp: Readonly<Vec3>,
  carryUp: Readonly<Vec3> | null,
): Vec3 | null {
  const p = planePart(poleAxis, planeNormal);
  const s = planePart(sceneUp, planeNormal);
  const raw: Vec3 = [
    blendW * p[0] + (1 - blendW) * s[0],
    blendW * p[1] + (1 - blendW) * s[1],
    blendW * p[2] + (1 - blendW) * s[2],
  ];
  const termMag = blendW * Math.hypot(...p) + (1 - blendW) * Math.hypot(...s);
  if (termMag <= 1e-9) return null;
  if (Math.hypot(...raw) >= HOLD_CONDITIONING * termMag) return normalize3(raw);
  if (carryUp !== null) {
    const carried = planePart(carryUp, planeNormal);
    if (Math.hypot(...carried) > 1e-9) return normalize3(carried);
  }
  return null;
}
