/**
 * site → host body arm (spec §4.3), which IS the disengage: the arm lands
 * anchored AT the site, not at the body centre, so the stored magnitudes stay
 * at rover scale. `site.id === pose.siteId` is a precondition, not a check.
 */

import type { BodyFixedPose } from '../../@types/camera/BodyFixedPose';
import type { BodyId } from '../../@types/data/body/BodyId';
import type { SitePose } from '../../@types/camera/SitePose';
import type { SurfaceFixedSite } from '../../@types/scene/SurfaceFixedSite';
import type { Vec3 } from '../../@types/math/Vec3';
import { canonicalBasisAt } from './canonicalBasisAt';
import { siteEyeFrame } from './siteEyeFrame';
import { sitePointBodyFixed } from './sitePointBodyFixed';

export function sitePoseToBodyArm(
  pose: SitePose,
  site: SurfaceFixedSite,
  hostRadiusM: number,
): BodyFixedPose {
  const anchorLocalM = sitePointBodyFixed(site, hostRadiusM);
  const frame = siteEyeFrame(anchorLocalM);
  const ce = Math.cos(pose.elevationRad);
  const se = Math.sin(pose.elevationRad);
  const ch = Math.cos(pose.headingRad);
  const sh = Math.sin(pose.headingRad);
  const { east, north, localUp } = frame;
  const eyeRelAnchorM: Vec3 = [
    pose.rangeM * (ce * (ch * north[0] + sh * east[0]) + se * localUp[0]),
    pose.rangeM * (ce * (ch * north[1] + sh * east[1]) + se * localUp[1]),
    pose.rangeM * (ce * (ch * north[2] + sh * east[2]) + se * localUp[2]),
  ];
  return {
    bodyId: site.hostId as BodyId,
    anchorLocalM,
    eyeRelAnchorM,
    basisLocal: canonicalBasisAt(frame, pose.headingRad + Math.PI, Math.PI / 2 - pose.elevationRad),
  };
}
