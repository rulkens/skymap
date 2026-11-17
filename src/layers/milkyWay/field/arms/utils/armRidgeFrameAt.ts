import { cross3 } from '../../../../../utils/math/cross3';
import { normalize3 } from '../../../../../utils/math/normalize3';
import { warpSurfaceFrame } from '../../mixture/utils/warpSurfaceFrame';
import type { GalaxyFieldArmRecord } from '../../../../../@types/galaxy/GalaxyFieldArmRecord';
import type { GalaxyDescription } from '../../../../../@types/galaxy/GalaxyDescription';
import type { Vec3 } from '../../../../../@types/math/Vec3';
import type { ArmRidgeFrame } from '../@types/ArmRidgeFrame';
import { armRidgeAngle } from './armRidgeAngle';
import { armRidgeCurvePoint } from './armRidgeCurvePoint';

/** The arm's true warped centre at a given radius — see `armRidgeCurvePoint`. */
function armCurvePos(radius: number, geometry: GalaxyDescription, arm: GalaxyFieldArmRecord): Vec3 {
  return armRidgeCurvePoint(Math.log(radius / geometry.armStartRadius), geometry, arm);
}

/**
 * The ridge's own orthonormal frame at a log-radius — `point` is
 * `armRidgeCurvePoint`, `along` its tangent (central difference), `across`/
 * `pole` the surface-tangent pair Gram-Schmidt'd off it. Shared by
 * `pushArmRidges`' per-blob placement and `deriveArmCloudCount.ts`'s lane-frame
 * provider, so both agree on what "the ridge" is by construction.
 */
export function armRidgeFrameAt(
  logR: number,
  geometry: GalaxyDescription,
  arm: GalaxyFieldArmRecord,
): ArmRidgeFrame {
  const radius = geometry.armStartRadius * Math.exp(logR);
  const angle = armRidgeAngle(logR, geometry, arm);
  const point = armRidgeCurvePoint(logR, geometry, arm);
  const ahead = armCurvePos(radius * 1.01, geometry, arm);
  const behind = armCurvePos(radius * 0.99, geometry, arm);
  const along = normalize3([ahead[0] - behind[0], ahead[1] - behind[1], ahead[2] - behind[2]]);
  const surfacePole = warpSurfaceFrame(radius, angle, geometry).pole;
  const across = normalize3(cross3(surfacePole, along));
  const pole = cross3(along, across); // re-orthonormalise: surfacePole need not be perpendicular to `along`
  return { point, along, across, pole };
}
