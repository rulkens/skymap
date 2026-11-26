/**
 * subjectWithinRelief — does the subject stand inside some body's relief band
 * (between its deepest basin and highest peak), i.e. on that body's ground?
 */

import type { Vec3 } from '../../../packages/shared/src/@types/math/Vec3';
import type { OccluderBody } from '../../@types/scene/OccluderBody';
import { SCALE_UNITS } from '../../data/scaleUnits';

export function subjectWithinRelief(
  subjectMpc: Readonly<Vec3>,
  bodies: readonly OccluderBody[],
): boolean {
  for (const body of bodies) {
    const dx = subjectMpc[0] - body.positionMpc[0];
    const dy = subjectMpc[1] - body.positionMpc[1];
    const dz = subjectMpc[2] - body.positionMpc[2];
    const dd = dx * dx + dy * dy + dz * dz;
    const inner = body.radiusM * SCALE_UNITS.M_TO_MPC;
    const outer = body.outerRadiusM * SCALE_UNITS.M_TO_MPC;
    if (dd >= inner * inner && dd <= outer * outer) return true;
  }
  return false;
}
