/**
 * sky → host body arm: anchored at the spot's GROUND point, as `sitePoseToBodyArm`
 * anchors at its site, so the stored magnitudes stay at human scale. Tilt is
 * `π/2 + altitude` in `canonicalBasisAt`'s convention (0 = straight down), whose
 * horizontal axis comes from the azimuth alone, so the zenith needs no special case.
 */

import type { BodyFixedPose } from '../../@types/camera/BodyFixedPose';
import type { SkyPose } from '../../@types/camera/SkyPose';
import type { SkySpot } from '../../@types/camera/SkySpot';
import type { Vec3 } from '../../@types/math/Vec3';
import { SKY_EYE_HEIGHT_M } from '../../data/camera/skyEyeHeightM';
import { canonicalBasisAt } from './canonicalBasisAt';
import { siteEyeFrame } from './siteEyeFrame';
import { skySpotRadial } from '../geo/skySpotRadial';

export function skyPoseToBodyArm(
  pose: SkyPose,
  spot: SkySpot,
  groundRadiusM: number,
): BodyFixedPose {
  const dir = skySpotRadial(spot);
  const enu = siteEyeFrame(dir);
  const up = enu.localUp;
  const anchorLocalM: Vec3 = [
    dir[0] * groundRadiusM,
    dir[1] * groundRadiusM,
    dir[2] * groundRadiusM,
  ];
  return {
    bodyId: spot.body,
    anchorLocalM,
    eyeRelAnchorM: [up[0] * SKY_EYE_HEIGHT_M, up[1] * SKY_EYE_HEIGHT_M, up[2] * SKY_EYE_HEIGHT_M],
    basisLocal: canonicalBasisAt(enu, pose.azimuthRad, Math.PI / 2 + pose.altitudeRad),
  };
}
