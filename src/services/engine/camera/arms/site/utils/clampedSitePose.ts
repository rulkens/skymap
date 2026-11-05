/**
 * The site arm's ground (spec §4.5). The floor ORDER is load-bearing: the eye
 * floor is range-dependent, so evaluating it before the range floor would leave
 * the eye under the ground whenever the range is clamped up. The HOST's floor
 * has no business here — the arm exists to get under it, and folding it in
 * saturates the `asin` at close range; the body arm enforces its own.
 */

import type { MeshBody } from '../../../../../../@types/scene/MeshBody';
import type { SitePose } from '../../../../../../@types/camera/pose/SitePose';
import { SITE_CAMERA_ARM } from '../data/siteCameraArm';

export function clampedSitePose(pose: SitePose, body: MeshBody): SitePose {
  const rangeM = Math.max(pose.rangeM, body.standoffRadii * body.boundingRadiusM);
  const floorRad = Math.asin(
    Math.min(1, (SITE_CAMERA_ARM.eyeFloorBoundingRadii * body.boundingRadiusM) / rangeM),
  );
  const elevationRad = Math.min(
    SITE_CAMERA_ARM.elevationCeilRad,
    Math.max(floorRad, pose.elevationRad),
  );
  return { ...pose, elevationRad, rangeM };
}
