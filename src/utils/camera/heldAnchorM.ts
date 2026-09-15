/** The surface point an arm holds on its sightline, or null where it holds
 * nothing — `[0,0,0]` is the ruled centre anchor (S2), which every body arm
 * but the site hand-back's carries. */

import type { BodyFixedPose } from '../../@types/camera/BodyFixedPose';
import type { Vec3 } from '../../@types/math/Vec3';

export function heldAnchorM(pose: BodyFixedPose): Vec3 | null {
  const a = pose.anchorLocalM;
  return a[0] === 0 && a[1] === 0 && a[2] === 0 ? null : a;
}
