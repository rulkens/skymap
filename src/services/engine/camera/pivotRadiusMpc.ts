/**
 * pivotRadiusMpc — physical radius (Mpc) of the camera's orbit pivot, or
 * `null` when it has no surface (galaxy/structure/Milky Way — flown INTO,
 * never floored). `runFrame.ts`/`frameContext.ts`/`logCameraState.ts` import
 * this scalar directly, so `pivotFraming` (the orbit-controls zoom-floor
 * bundle) is built beside it below rather than displacing it.
 */

import { SCALE_UNITS } from '../../../data/scaleUnits';
import { SCENE_BODIES } from '../../../data/bodies/sceneBodies';
import { MIN_DISTANCE_MPC, SURFACE_STANDOFF_RADII } from '../../../utils/camera/clampDistance';
import { findByIdOrThrow } from '../../../utils/object/findByIdOrThrow';
import { isMeshBody } from '../../../utils/scene/isMeshBody';
import type { SelectionRow } from '../../../@types/engine/SelectionRow';
import type { PivotFraming } from '../../../@types/camera/PivotFraming';

export function pivotRadiusMpc(row: SelectionRow | null): number | null {
  if (row === null) return null;
  if (row.type === 'star') return row.radiusM * SCALE_UNITS.M_TO_MPC;
  if (row.type !== 'body') return null;
  // A mesh body has a hull, not ground, so it has nothing to report here — the
  // taper anchor and the h/R readouts stay honest on a body with no surface.
  const body = findByIdOrThrow(SCENE_BODIES, row.id, 'pivotRadiusMpc');
  return isMeshBody(body) ? null : body.radiusM * SCALE_UNITS.M_TO_MPC;
}

/**
 * SURFACELESS_FLOOR_MPC — zoom floor (Mpc, ≈ 309 km) `pivotFraming` uses when
 * the pivot has no surface: holds the target above `foregroundFrustum.ts`'s
 * `MIN_NEAR_MPC` (~6 m), inside which it vanishes. Where the pivot DOES have a
 * radius, `pivotFraming` floors on `MIN_DISTANCE_MPC` instead (a sub-3 cm body).
 */
export const SURFACELESS_FLOOR_MPC = 1e-17;

export function pivotFraming(row: SelectionRow | null): PivotFraming {
  const body =
    row !== null && row.type === 'body'
      ? findByIdOrThrow(SCENE_BODIES, row.id, 'pivotFraming')
      : null;
  // A mesh body has no ground to taper against, yet its hull is a real obstacle,
  // so the zoom still floors a standoff off it. A galaxy/structure has neither
  // and is flown INTO.
  if (body !== null && isMeshBody(body)) {
    const boundingMpc = body.boundingRadiusM * SCALE_UNITS.M_TO_MPC;
    return {
      radiusMpc: null,
      floorMpc: Math.max(MIN_DISTANCE_MPC, boundingMpc * body.standoffRadii),
    };
  }
  const radiusMpc = pivotRadiusMpc(row);
  if (radiusMpc === null) return { radiusMpc, floorMpc: SURFACELESS_FLOOR_MPC };
  // Only `AnchorPointBody` opts out of the Earth-tuned default (Sgr A*'s Q10
  // floor); `in` alone widens the absent arms to `unknown`, hence the typeof.
  const standoffRadii =
    body !== null && 'standoffRadii' in body && typeof body.standoffRadii === 'number'
      ? body.standoffRadii
      : SURFACE_STANDOFF_RADII;
  return {
    radiusMpc,
    floorMpc: Math.max(MIN_DISTANCE_MPC, radiusMpc * standoffRadii),
  };
}
