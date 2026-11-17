import { armRidgeAngle } from './armRidgeAngle';
import { warpHeight } from '../../mixture/utils/warpHeight';
import type { GalaxyFieldArmRecord } from '../../../../../@types/galaxy/GalaxyFieldArmRecord';
import type { GalaxyDescription } from '../../../../../@types/galaxy/GalaxyDescription';
import type { Vec3 } from '../../../../../@types/math/Vec3';

/**
 * Ridge position at a given log-radius — armStarSample's `x`/`y`/`z` before
 * scatter, the exact curve blobs are placed on. Shared by the dense
 * curvature sample (`deriveArmBlobCount`) and the actual placement below so
 * both agree on what "the ridge" is by construction, not by staying in sync.
 */
export function armRidgeCurvePoint(
  logR: number,
  geometry: GalaxyDescription,
  arm: GalaxyFieldArmRecord,
): Vec3 {
  const radius = geometry.armStartRadius * Math.exp(logR);
  const angle = armRidgeAngle(logR, geometry, arm);
  return [radius * Math.cos(angle), warpHeight(radius, angle, geometry), radius * Math.sin(angle)];
}
