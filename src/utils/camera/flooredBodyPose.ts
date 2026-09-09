import type { BodyFixedPose } from '../../@types/camera/BodyFixedPose';
import { bodyFixedEyeM } from './bodyFixedEyeM';
import { surfaceFloorM } from './surfaceFloorM';

/**
 * The descent floor, unconditional and resampled after the last position write
 * (spec §6, O §4). The push is radial, so it moves the eye without turning it —
 * the same reason `anchoredZoomStep` rescales rather than rotating (C §6.6's
 * "rotate the basis by the angle collision moved the eye" has zero angle here).
 * A tilt about a surface anchor holds `|eye − anchor|`, not `|eye|`, so without
 * this a long tilt drag walks the eye straight through the ground.
 */
export function flooredBodyPose(pose: BodyFixedPose, bodyRadiusM: number): BodyFixedPose {
  const eyeM = bodyFixedEyeM(pose);
  const magM = Math.hypot(...eyeM);
  const floorM = surfaceFloorM(bodyRadiusM);
  // An eye exactly at the centre has no push direction; no bounded step reaches
  // it from a floored pose, and leaving it beats returning NaN.
  if (magM >= floorM || magM === 0) return pose;
  const scale = floorM / magM;
  const { anchorLocalM: a } = pose;
  return {
    ...pose,
    eyeRelAnchorM: [eyeM[0] * scale - a[0], eyeM[1] * scale - a[1], eyeM[2] * scale - a[2]],
  };
}
