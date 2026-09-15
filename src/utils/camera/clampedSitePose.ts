/**
 * The site rung's ground (spec §4.5). The floor ORDER is load-bearing: the eye
 * floor is range-dependent, so evaluating it before the range floor would leave
 * the eye under the ground whenever the range is clamped up.
 */

import type { MeshBody } from '../../@types/scene/MeshBody';
import type { SitePose } from '../../@types/camera/SitePose';
import { SITE_RUNG } from '../../data/camera/siteRung';

export function clampedSitePose(pose: SitePose, body: MeshBody): SitePose {
  const rangeM = Math.max(pose.rangeM, body.standoffRadii * body.boundingRadiusM);
  const floorRad = Math.asin(
    Math.min(1, (SITE_RUNG.eyeFloorBoundingRadii * body.boundingRadiusM) / rangeM),
  );
  const elevationRad = Math.min(SITE_RUNG.elevationCeilRad, Math.max(floorRad, pose.elevationRad));
  return { ...pose, elevationRad, rangeM };
}
