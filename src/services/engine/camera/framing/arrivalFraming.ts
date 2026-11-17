/**
 * arrivalFraming — where any focus arrival lands: on the row's position, far enough that the
 * object's diameter fills `arrivalSize` of the screen height. Since the half-height subtends
 * `tan(fovY/2)` at unit distance, `distance = radiusMpc / (arrivalSize · tan(fovY/2))` keeps that
 * fill at every FOV. Deliberately unclamped unless the kind declares a bound: at ~2e-16 Mpc
 * (Earth) any Mpc-scale floor would swallow the framing; the wheel-zoom clamps own the floor.
 */

import type { FocusFraming } from '../../../../@types/camera/pose/FocusFraming';
import type { SelectionFocus } from '../../../../@types/engine/layer/SelectionFocus';
import type { PlacedRow } from '../../../../@types/engine/selection/PlacedRow';

/** A radius with nothing to frame (≤ 0, NaN, or +∞ with no cap) still lands somewhere finite. */
const DEGENERATE_RADIUS_DISTANCE_MPC = 0.1;

export function arrivalFraming(
  row: PlacedRow,
  focus: SelectionFocus,
  fovYRad: number,
): FocusFraming {
  const { positionMpc, radiusMpc } = row;
  const fill = radiusMpc / (focus.arrivalSize * Math.tan(fovYRad / 2));
  const clamped = Math.min(
    Math.max(fill, focus.minDistanceMpc ?? 0),
    focus.maxDistanceMpc ?? Number.POSITIVE_INFINITY,
  );
  const realRadius = Number.isFinite(radiusMpc) && radiusMpc > 0;
  return {
    target: [positionMpc[0], positionMpc[1], positionMpc[2]],
    // +∞ passes when a cap turned it finite; NaN fails `> 0`.
    distance: radiusMpc > 0 && Number.isFinite(clamped) ? clamped : DEGENERATE_RADIUS_DISTANCE_MPC,
    radius: focus.flyInto || !realRadius ? 0 : radiusMpc,
  };
}
