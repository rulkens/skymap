/**
 * The Zone of Avoidance exhibit's framing, in its own module so a clip can
 * reuse it without importing the exhibit's overlay components.
 */

import type { CameraPose } from '../../@types/camera/CameraPose';

/**
 * Eye 20° above the galactic plane on the ANTICENTRE side, so the aim runs
 * toward the galactic centre where the wedge is at its 10° bulge width rather
 * than the 3° it narrows to the other way (`ZONE_OF_AVOIDANCE_SHELL`).
 * Derived through `orbitAnglesLookingAlong` against the ecliptic basis — the
 * default orientation — never a hand-rolled inverse. POSITIVE pitch is above
 * the plane: that helper solves `pitch = asin(-forward.y)`, and `-forward`
 * runs from target to EYE. Yaw is then swung off the exact centre so the band
 * crosses frame-left, clearing the overlay's right-hand notes column.
 */
const GALACTIC_LATITUDE_YAW = -3.15;
const GALACTIC_LATITUDE_PITCH = 0.263728;

/**
 * LOAD-BEARING, and not a framing choice: the band is only drawn between
 * roughly 0.15 Mpc and 6 Mpc. The `zoneOfAvoidance` entry's `veil` band is an
 * approach window composed with a recede one (full at 2 Mpc, gone by 6), because the guide
 * is scoped to the Milky-Way-context shot. Frame this exhibit at cosmic-web distances and it renders nothing at all.
 */
const FRAMING_MPC = 1.2;

export const ZONE_OF_AVOIDANCE_POSE: CameraPose = {
  target: [0, 0, 0],
  yaw: GALACTIC_LATITUDE_YAW,
  pitch: GALACTIC_LATITUDE_PITCH,
  distance: FRAMING_MPC,
};
