/**
 * bodyCameraDistanceMpc — camera-to-body-centre range from the live per-frame
 * snapshot position, NOT `cam.distance` (the orbit distance-to-FOCUS, which
 * coincides with this only while that body is the orbit pivot).
 *
 * Earth's sub-pixel cull, the cloud-deck descent fade and the shadow the deck
 * casts on both the base globe and the surface tiles all key off this one
 * quantity; sharing it is what keeps them from drifting onto two readings.
 */

import type { Vec3 } from '../../@types/math/Vec3';

export function bodyCameraDistanceMpc(bodyPositionMpc: Vec3, camPosMpc: Readonly<Vec3>): number {
  return Math.hypot(
    bodyPositionMpc[0] - camPosMpc[0],
    bodyPositionMpc[1] - camPosMpc[1],
    bodyPositionMpc[2] - camPosMpc[2],
  );
}
