/**
 * blendedEnuAt — east/north at `localUp` for the band-blended reference up
 * (ruling 8, rounds 6–7): north is the normalized blend of the two
 * references' HORIZONTAL projections, `w·pole_h + (1−w)·sceneUp_h`. Any
 * continuous reference field between two fixed axes has a singular locus
 * (where the horizontals cancel — topology, not a construction flaw). Where
 * the blend is ill-conditioned (terms nearly cancelling), `carryUp` — the
 * pose's own screen-up — stands in as north, so the field is continuous
 * ALONG THE PATH and no spurious settle churn happens inside the singular
 * neighbourhood; the intrinsic through-flip rotation surfaces at the exit,
 * bounded by the ride guard and drained by the world arm's above-band decay.
 * At `w = 1` (no cancellation possible) this IS `headingTiltAt`'s
 * construction, fallback included. ONE home — the engaged settle and the
 * camera debug readout both read THIS.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import { cross3 } from '../math/cross3';
import { normalize3 } from '../math/normalize3';

const BODY_POLE: Vec3 = [0, 0, 1];

/**
 * `|blend| / (w·|pole_h| + (1−w)·|sceneUp_h|)` below this ⇒ the terms are
 * cancelling and the direction is a coin flip — hold the carry instead.
 * Structural, not feel-tunable: it marks where the maths stops meaning.
 */
const HOLD_CONDITIONING = 0.3;

function horizontalPart(v: Readonly<Vec3>, localUp: Readonly<Vec3>): Vec3 {
  const vert = v[0] * localUp[0] + v[1] * localUp[1] + v[2] * localUp[2];
  return [v[0] - localUp[0] * vert, v[1] - localUp[1] * vert, v[2] - localUp[2] * vert];
}

export function blendedEnuAt(
  localUp: Readonly<Vec3>,
  blendW: number,
  sceneUpLocal: Readonly<Vec3>,
  carryUp: Readonly<Vec3> | null,
): { readonly east: Vec3; readonly north: Vec3 } {
  const p = horizontalPart(BODY_POLE, localUp);
  const s = horizontalPart(sceneUpLocal, localUp);
  const raw: Vec3 = [
    blendW * p[0] + (1 - blendW) * s[0],
    blendW * p[1] + (1 - blendW) * s[1],
    blendW * p[2] + (1 - blendW) * s[2],
  ];
  const mag = Math.hypot(...raw);
  const termMag = blendW * Math.hypot(...p) + (1 - blendW) * Math.hypot(...s);
  if (termMag > 1e-9) {
    if (mag >= HOLD_CONDITIONING * termMag) {
      const north = normalize3(raw);
      return { east: cross3(north, localUp), north };
    }
    if (carryUp !== null) {
      // Hold-and-transport (round 7): the terms are present but CANCELLING —
      // the singular neighbourhood — so the reference is wherever the settle
      // already put the view. (A standpoint where both horizontals simply
      // vanish is a different case: the classic fallback below owns it.)
      const carried = horizontalPart(carryUp, localUp);
      if (Math.hypot(...carried) > 1e-9) {
        const north = normalize3(carried);
        return { east: cross3(north, localUp), north };
      }
    }
  }
  // Degenerate with nothing to carry: the classic pole-ENU fallback,
  // byte-for-byte `headingTiltAt`'s.
  const eastRaw = cross3(BODY_POLE, localUp);
  const eastLen = Math.hypot(...eastRaw);
  const east: Vec3 =
    eastLen > 1e-9 ? [eastRaw[0] / eastLen, eastRaw[1] / eastLen, eastRaw[2] / eastLen] : [1, 0, 0];
  return { east, north: cross3(localUp, east) };
}
