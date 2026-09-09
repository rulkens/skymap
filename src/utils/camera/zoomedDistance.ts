/**
 * Apply a wheel/pinch zoom factor as a step in ALTITUDE above a pivot's
 * surface, not in raw distance from its centre: with `h = distance −
 * pivot.radiusMpc`, `distance′ = radiusMpc + h · factor`, so steps shrink
 * without bound as `h → 0`. Scaling `distance` directly is right in deep space,
 * but a focused body's target is its CENTRE, so near the surface `distance` is
 * dominated by the body's radius — a 10% notch at Earth is ~637 km, several
 * times the whole usable band above the standoff floor. For `h ≫ radiusMpc`,
 * and for `radiusMpc === null` (no surface), this degenerates to plain scaling
 * exactly. `clampDistance` is called from in here, not by the caller, so the
 * envelope is enforced in one place.
 */

import { clampDistance } from './clampDistance';
import type { PivotFraming } from '../../@types/camera/PivotFraming';

export function zoomedDistance(distance: number, factor: number, pivot: PivotFraming): number {
  const { radiusMpc, floorMpc } = pivot;
  if (radiusMpc === null) {
    return clampDistance(distance * factor, floorMpc);
  }

  const h = distance - radiusMpc;
  if (h <= 0) {
    // The pose is not orbiting this pivot's centre: a pose that left the body
    // arm carries a range along its VIEW RAY (`poseFrameConversion.ts:
    // toWorldArm`), which a bigger body's floor can exceed. No altitude exists
    // to taper, so scale plainly — and floor at the range we were GIVEN,
    // because clamping UP to `floorMpc` teleports the eye outward by ~a body
    // radius on the first notch. Never ratcheting outward keeps the floor's
    // intent (never get closer inside the envelope) without the jump.
    return clampDistance(distance * factor, Math.min(floorMpc, distance));
  }

  return clampDistance(radiusMpc + h * factor, floorMpc);
}
