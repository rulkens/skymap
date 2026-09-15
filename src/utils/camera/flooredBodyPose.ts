import type { BodyFixedPose } from '../../@types/camera/BodyFixedPose';
import type { Vec3 } from '../../@types/math/Vec3';
import { bodyFixedEyeM } from './bodyFixedEyeM';
import { rotatedAboutPoint } from './rotatedAboutPoint';
import { surfaceFloorM } from './surfaceFloorM';
import { cross3 } from '../math/cross3';
import { dot3 } from '../math/dot3';
import { normalize3 } from '../math/normalize3';
import { quatFromAxisAngle } from '../math/quatFromAxisAngle';

/**
 * The descent floor, unconditional and resampled after the last position write
 * (spec §6, O §4). Serving a point — a focused rover — the lift RAISES THE
 * EYE'S ELEVATION about it at constant range, so the point holds the sightline;
 * a radial push instead takes it off centre and every later notch keeps it
 * there. With no point the push is radial, which moves the eye without turning.
 */
export function flooredBodyPose(
  pose: BodyFixedPose,
  bodyRadiusM: number,
  standoffRadii: number,
  pivotM: Readonly<Vec3> | null,
): BodyFixedPose {
  const eyeM = bodyFixedEyeM(pose);
  const magM = Math.hypot(...eyeM);
  const floorM = surfaceFloorM(bodyRadiusM, standoffRadii);
  // An eye exactly at the centre has no push direction; no bounded step reaches
  // it from a floored pose, and leaving it beats returning NaN.
  if (magM >= floorM || magM === 0) return pose;

  if (pivotM !== null) {
    const pivotMagM = Math.hypot(...pivotM);
    const relM: Vec3 = [eyeM[0] - pivotM[0], eyeM[1] - pivotM[1], eyeM[2] - pivotM[2]];
    const rangeM = Math.hypot(...relM);
    // `|eye|² = |pivot|² + 2·range·|pivot|·sin(elevation) + range²`, so the
    // floor names the elevation this turn has to reach.
    const sinTarget =
      (floorM * floorM - pivotMagM * pivotMagM - rangeM * rangeM) / (2 * rangeM * pivotMagM);
    // Turning in the plane the two span; `cross(rel, pivot)` is the axis that
    // carries the eye UP from the pivot's tangent plane.
    const axisM = cross3(relM, pivotM);
    // Straight over the pivot spans no plane, and past `sin = 1` the floor is
    // out of reach at this range — the radial push is the only answer left.
    if (sinTarget <= 1 && Math.hypot(...axisM) > 0) {
      const sinNow = Math.min(1, Math.max(-1, dot3(relM, pivotM) / (rangeM * pivotMagM)));
      return rotatedAboutPoint(
        pose,
        quatFromAxisAngle(normalize3(axisM), Math.asin(sinTarget) - Math.asin(sinNow)),
        pivotM,
      );
    }
  }

  const scale = floorM / magM;
  const { anchorLocalM: a } = pose;
  return {
    ...pose,
    eyeRelAnchorM: [eyeM[0] * scale - a[0], eyeM[1] * scale - a[1], eyeM[2] * scale - a[2]],
  };
}
