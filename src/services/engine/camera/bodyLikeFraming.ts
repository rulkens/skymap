/**
 * bodyLikeFraming — frame a discrete near-field body on its physical radius.
 *
 * The seeded-body arm and the survey-star arm of `focusFraming` differ in their
 * ROW SHAPE (a body carries id + label; a star carries index + photometry) —
 * that asymmetry is essential and the switch keeps the two cases apart. But the
 * FRAMING itself is identical: convert a physical radius (km) to Mpc, point the
 * camera at the world position, and let `bodyFocusDistance` do the unclamped
 * screen-fill math. That shared body was the accidental duplication — two copies
 * of the same three lines that would have to change in lockstep. This helper is
 * its one home; both arms extract their own `positionMpc` + `radiusKm` and
 * delegate here.
 *
 * The distance is deliberately UNCLAMPED: at ~2e-16 Mpc (Earth) any Mpc-scale
 * floor would swallow the framing. The wheel-zoom / descent clamps own the floor
 * (clampDistance.ts: MIN_DISTANCE_MPC reaches Earth-surface scale), keeping the
 * result reachable in practice.
 */

import { bodyFocusDistance } from './bodyFocusDistance';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { FocusFraming } from './focusFraming';

export function bodyLikeFraming(
  positionMpc: Vec3,
  radiusKm: number,
  fovYRad: number,
): FocusFraming {
  const radiusMpc = radiusKm * SCALE_UNITS.KM_TO_MPC;
  return {
    target: [positionMpc[0], positionMpc[1], positionMpc[2]],
    distance: bodyFocusDistance(radiusMpc, fovYRad),
    // A discrete object like a galaxy — its physical radius is a real pass-by
    // extent for flyPath's offset geometry.
    radius: radiusMpc,
  };
}
