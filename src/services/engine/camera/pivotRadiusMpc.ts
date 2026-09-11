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
 * Zoom floor (Mpc, ≈ 309 km) for a pivot with no surface: a galaxy has no radius
 * to keep the camera out, so this alone holds the target above
 * `foregroundFrustum.ts: MIN_NEAR_MPC` (~6 m), inside which it vanishes.
 */
export const SURFACELESS_FLOOR_MPC = 1e-17;

/**
 * pivotFraming — orbit-controls' single getter target: radius + precomputed
 * zoom floor, the pivot's own radius where it has one (`MIN_DISTANCE_MPC`
 * backstopping a sub-3 cm body), `SURFACELESS_FLOOR_MPC` where it does not.
 */
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
