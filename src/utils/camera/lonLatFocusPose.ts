import type { BodyFixedPose } from '../../@types/camera/BodyFixedPose';
import type { BodyId } from '../../@types/data/body/BodyId';
import type { LonLatDeg } from '../../@types/scene/LonLatDeg';
import type { Vec3 } from '../../@types/math/Vec3';
import { BODY_LOCAL_FRAME } from '../../data/camera/bodyLocalFrame';
import { blendedEnuAt } from './blendedEnuAt';
import { canonicalBasisAt } from './canonicalBasisAt';
import { lonLatDegToDirection } from '../scene/lonLatDegToDirection';

/**
 * lonLatFocusPose — the body arm that puts a geodetic point under the camera:
 * standpoint from the lon/lat, `rangeM` the straight-down sightline range to
 * the surface (so |eye| = R + rangeM), tilt 0, heading held. No Mpc in it — a
 * pose that lands outside the band is the frame fold's business, not the
 * caller's (spec §9).
 */
export function lonLatFocusPose(
  point: LonLatDeg,
  bodyId: BodyId,
  bodyRadiusM: number,
  rangeM: number,
  headingRad: number,
): BodyFixedPose {
  const localUp = lonLatDegToDirection(point);
  const eyeMagM = bodyRadiusM + rangeM;
  const eyeRelAnchorM: Vec3 = [localUp[0] * eyeMagM, localUp[1] * eyeMagM, localUp[2] * eyeMagM];
  // Pure body ENU (`blendW` 1 — the scene up carries no weight there), the same
  // reference `eyeFrameOf` reads a heading back against.
  const { east, north } = blendedEnuAt(localUp, 1, BODY_LOCAL_FRAME.pole, null);
  return {
    bodyId,
    anchorLocalM: [0, 0, 0],
    eyeRelAnchorM,
    basisLocal: canonicalBasisAt(
      { localUp, east, north, tiltRad: 0, azimuthRad: headingRad },
      headingRad,
      0,
    ),
  };
}
