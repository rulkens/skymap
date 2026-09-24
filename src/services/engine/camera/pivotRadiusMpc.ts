/**
 * pivotRadiusMpc — physical radius (Mpc) of the camera's orbit pivot, or
 * `null` when it has no surface (galaxy/structure/Milky Way, flown INTO and
 * never floored; or a mesh body, whose hull is a floor but not a surface).
 * `pivotSurfaceRangeMpc.ts`/`logCameraState.ts` import this scalar directly, so
 * `pivotFraming` (the orbit-controls zoom-floor bundle) is built beside it
 * below rather than displacing it.
 */

import { SCALE_UNITS } from '../../../data/scaleUnits';
import { MIN_DISTANCE_MPC } from '../../../utils/camera/clampDistance';
import { selectionDriver } from '../../../utils/selection/selectionDriver';
import type { SelectionRow } from '../../../@types/engine/SelectionRow';
import type { PivotFraming } from '../../../@types/camera/PivotFraming';

export function pivotRadiusMpc(row: SelectionRow | null): number | null {
  // A groundless driver (a mesh body's hull) has nothing to report here.
  const groundRadiusM = selectionDriver(row)?.groundRadiusM ?? null;
  return groundRadiusM === null ? null : groundRadiusM * SCALE_UNITS.M_TO_MPC;
}

/**
 * SURFACELESS_FLOOR_MPC — zoom floor (Mpc, ≈ 309 km) `pivotFraming` uses when
 * the pivot has no surface: holds the target above `foregroundFrustum.ts`'s
 * `MIN_NEAR_MPC` (~6 m), inside which it vanishes. Where the pivot DOES have a
 * radius, `pivotFraming` floors on `MIN_DISTANCE_MPC` instead (a sub-3 cm body).
 */
export const SURFACELESS_FLOOR_MPC = 1e-17;

export function pivotFraming(row: SelectionRow | null): PivotFraming {
  const driver = selectionDriver(row);
  if (driver === null) return { radiusMpc: null, floorMpc: SURFACELESS_FLOOR_MPC };
  // No ground to taper against (MeshBody.boundingRadiusM), but the hull is a
  // real obstacle, so the zoom still floors a standoff off it.
  if (driver.groundRadiusM === null) {
    const boundingMpc = driver.boundingRadiusM * SCALE_UNITS.M_TO_MPC;
    return {
      radiusMpc: null,
      floorMpc: Math.max(MIN_DISTANCE_MPC, boundingMpc * driver.standoffRadii),
    };
  }
  const radiusMpc = driver.groundRadiusM * SCALE_UNITS.M_TO_MPC;
  return {
    radiusMpc,
    floorMpc: Math.max(MIN_DISTANCE_MPC, radiusMpc * driver.standoffRadii),
  };
}
