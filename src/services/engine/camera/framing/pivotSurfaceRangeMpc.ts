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
import { isWorldArm } from '../arms/world/isWorldArm';
import type { FramedCameraPose } from '../../../../@types/camera/pose/FramedCameraPose';
import type { SelectionRowBase } from '../../../../@types/engine/selection/SelectionRowBase';

export function pivotSurfaceRangeMpc(
  arm: FramedCameraPose,
  worldDistanceMpc: number,
  focus: SelectionRowBase | null,
): number {
  return isWorldArm(arm) ? worldDistanceMpc - (pivotRadiusMpc(focus) ?? 0) : worldDistanceMpc;
}
