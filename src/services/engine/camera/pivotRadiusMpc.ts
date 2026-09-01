/**
 * pivotRadiusMpc — the physical radius (Mpc) of whatever sits at the camera's
 * orbit pivot, or `null` when the pivot has no surface.
 *
 * The one place that maps a resolved `SelectionRow` onto a pivot radius. A
 * body or survey star is a surface the camera can crash into; a galaxy, a
 * structure, or the Milky Way is a volume the camera flies INTO, so those stay
 * `null` and unfloored. `runFrame.ts`/`frameContext.ts`/`logCameraState.ts`
 * consume this scalar directly (altitude math, debug logging) — `pivotFraming`
 * below is the orbit-controls lane's own bundle, built beside it in the same
 * file rather than displacing this export.
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
 * pivotFraming — the orbit-controls lane's single getter target: radius +
 * precomputed zoom floor for the resolved focus row. `standoffRadii` reads a
 * body row's own override (Sgr A*'s Q10 floor) else the global ratio.
 * `radiusMpc ?? 0` makes a surfaceless pivot's floor collapse to
 * `MIN_DISTANCE_MPC`, matching the old null-radius clamp exactly.
 */
export function pivotFraming(row: SelectionRow | null): PivotFraming {
  const radiusMpc = pivotRadiusMpc(row);
  const standoffRadii =
    row !== null && row.type === 'body'
      ? (row.standoffRadii ?? SURFACE_STANDOFF_RADII)
      : SURFACE_STANDOFF_RADII;
  return {
    radiusMpc,
    floorMpc: Math.max(MIN_DISTANCE_MPC, (radiusMpc ?? 0) * standoffRadii),
  };
}
