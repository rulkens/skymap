/**
 * pivotRadiusMpc — physical radius (Mpc) of the camera's orbit pivot, or
 * `null` when it has no surface (galaxy/structure/Milky Way — flown INTO,
 * never floored). `runFrame.ts`/`frameContext.ts`/`logCameraState.ts` import
 * this scalar directly, so `pivotFraming` (the orbit-controls zoom-floor
 * bundle) is built beside it below rather than displacing it.
 */

import { SCALE_UNITS } from '../../../data/scaleUnits';
import { MIN_DISTANCE_MPC, SURFACE_STANDOFF_RADII } from '../../../utils/camera/clampDistance';
import type { SelectionRow } from '../../../@types/engine/SelectionRow';
import type { PivotFraming } from '../../../@types/camera/PivotFraming';

export function pivotRadiusMpc(row: SelectionRow | null): number | null {
  if (row === null) return null;
  if (row.type !== 'body' && row.type !== 'star') return null;
  return row.radiusM * SCALE_UNITS.M_TO_MPC;
}

/**
 * SURFACELESS_FLOOR_MPC — zoom floor (Mpc, ≈ 309 km) `pivotFraming` uses when
 * the pivot has no surface: holds the target above `foregroundFrustum.ts`'s
 * `MIN_NEAR_MPC` (~6 m), inside which it vanishes. Where the pivot DOES have a
 * radius, `pivotFraming` floors on `MIN_DISTANCE_MPC` instead (a sub-3 cm body).
 */
export const SURFACELESS_FLOOR_MPC = 1e-17;

export function pivotFraming(row: SelectionRow | null): PivotFraming {
  const radiusMpc = pivotRadiusMpc(row);
  if (radiusMpc === null) return { radiusMpc, floorMpc: SURFACELESS_FLOOR_MPC };
  const standoffRadii =
    row !== null && row.type === 'body'
      ? (row.standoffRadii ?? SURFACE_STANDOFF_RADII)
      : SURFACE_STANDOFF_RADII;
  return {
    radiusMpc,
    floorMpc: Math.max(MIN_DISTANCE_MPC, radiusMpc * standoffRadii),
  };
}
