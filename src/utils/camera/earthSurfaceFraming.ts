/**
 * earthSurfaceFraming — the pure core of the fly-to-Earth descent tween.
 *
 * Given Earth's position and radius it returns the `{ target, distance }` the
 * descent settles on: the camera parked a few Earth-radii off the surface,
 * looking at Earth's centre. A saga (Task 6) carries the live yaw/pitch and
 * wraps this into the tween payload — this function is state-free so it is
 * trivially unit-testable, mirroring `focusFraming`/`focusTweenDescriptor`.
 *
 * ### Why a few Earth-radii distance
 *
 * Close enough that Earth fills much of the frame (the payoff shot of the
 * descent), but far enough that the foreground near plane clears the surface.
 * The near-field frustum is adaptive — `foregroundFrustum(distance).near` is
 * `distance · 1e-4` (floored at `MIN_NEAR_MPC`) — so at this framing the near
 * plane sits ~1e-4 of the orbit distance in front of the camera while Earth's
 * surface sits `distance − radius` away (~1.5 radii). That is many orders of
 * magnitude of clearance, so the descent never ends inside the near plane.
 * `SURFACE_RADII` is deliberately a small multiple: pull it below ~1 and the
 * camera would be underground; push it to galaxy scale and Earth shrinks to a
 * dot. It is tied to `foregroundFrustum`'s near ratio by this reasoning — if
 * either constant moves, re-check that `distance − radius` still clears
 * `foregroundFrustum(distance).near`.
 *
 * ### Why only target + distance change
 *
 * The descent preserves the user's orientation — yaw/pitch carry from the live
 * pose at the call site (same shared shape as `focusTweenDescriptor`), so the
 * fly-in feels like the camera gliding down to Earth from wherever it already
 * looks, not a jarring snap to a canned angle. This helper therefore returns
 * only the two fields a focus changes.
 */

import { SCALE_UNITS } from '../../data/scaleUnits';
import type { Vec3 } from '../../@types/math/Vec3';

/**
 * How many Earth radii back the descent parks the camera. A small multiple:
 * Earth fills the frame yet the surface stays well clear of
 * `foregroundFrustum(distance).near` (see the module docblock).
 */
const SURFACE_RADII = 2.5;

export function earthSurfaceFraming(
  positionMpc: Vec3,
  radiusKm: number,
): { target: Vec3; distance: number } {
  // Fresh array — the result must never alias the caller's position vector, so a
  // consumer mutating the target can't reach back into the seed or derived state.
  const target: Vec3 = [positionMpc[0], positionMpc[1], positionMpc[2]];
  const radiusMpc = radiusKm * SCALE_UNITS.KM_TO_MPC;
  return { target, distance: SURFACE_RADII * radiusMpc };
}
