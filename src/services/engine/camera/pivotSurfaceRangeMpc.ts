/**
 * pivotSurfaceRangeMpc — range from the eye to the pivot's surface, in Mpc.
 *
 * The FRAME decides, because the two arms already measure different things: a
 * body arm's world pose reports eye→ground (`toWorldArm` ranges to the near
 * root on the forward ray), while the absolute arm ranges to the pivot CENTRE
 * and still needs the radius taken off. Subtracting unconditionally drives an
 * engaged arm's range to zero or below — which is how the scale bar froze and
 * the near-field bracket collapsed.
 */

import { pivotRadiusMpc } from './pivotRadiusMpc';
import type { FramedCameraPose } from '../../../@types/camera/FramedCameraPose';
import type { SelectionRow } from '../../../@types/engine/SelectionRow';

export function pivotSurfaceRangeMpc(
  arm: FramedCameraPose,
  worldDistanceMpc: number,
  focus: SelectionRow | null,
): number {
  return arm.frame === 'absolute'
    ? worldDistanceMpc - (pivotRadiusMpc(focus) ?? 0)
    : worldDistanceMpc;
}
