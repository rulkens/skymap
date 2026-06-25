/**
 * focusFraming — the shared SelectionRow→pose resolver for focus-based camera
 * positioning.
 *
 * ### Why extracted here instead of living inside focusTweenDescriptor
 *
 * Two consumers need "given a resolved row and the lens FOV, where should the
 * camera point and how far back should it sit?": the focus tween (which builds
 * an animated descriptor) and the tour saga's visitBeatSaga (which needs the target
 * pose to build a fly clip). Duplicating the tagged-union framing switch across
 * both would be the decomplection smell the project forbids — a change to
 * structure-framing logic would require two edits instead of one. One shared
 * pure helper is the home.
 *
 * ### Per-arm framing strategy
 *
 *   - galaxyCatalog: physical diameter drives the distance via `galaxyFocusDistance`.
 *   - structure: apparent extent through the projection FOV via `structureFocusDistance`;
 *     the `apparentRadiusMpc ?? physicalRadiusMpc` fallback ensures every
 *     structure record resolves to a sensible distance.
 *   - milkyWay: fixed world-space centre at a calibrated view distance — we are
 *     inside the galaxy, so no radius or FOV computation makes sense.
 *
 * The return type is `Pick<CameraPose, 'target' | 'distance'>` — just the
 * position-and-depth slice. Callers carry the orientation (yaw/pitch) themselves.
 */

import { galaxyFocusDistance } from './galaxyFocusDistance';
import { structureFocusDistance } from './structureFocusDistance';
import {
  MILKY_WAY_CENTER_WORLD,
  MILKY_WAY_VIEW_DISTANCE_MPC,
} from '../../../data/milkyWay/galacticCenter';
import type { SelectionRow } from '../../../@types/engine/SelectionRow';
import type { CameraPose } from '../../../@types/camera/CameraPose';

/**
 * Compute the target world position and orbit distance appropriate for a
 * focus on the given resolved row, given the camera's current vertical FOV.
 *
 * Returns the two fields that change on a focus; orientation (yaw/pitch) is
 * the caller's responsibility.
 */
export function focusFraming(
  row: SelectionRow,
  fovYRad: number,
): Pick<CameraPose, 'target' | 'distance'> {
  switch (row.type) {
    case 'galaxyCatalog':
      return { target: [row.x, row.y, row.z], distance: galaxyFocusDistance(row.diameterKpc) };
    case 'structure':
      return {
        target: [row.worldPos[0], row.worldPos[1], row.worldPos[2]],
        // Frame on the WIDER apparent extent — the radius the close-approach
        // fade reads — so the ring + label land just past their fade-out;
        // fall back to the physical core when there is no wider extent.
        distance: structureFocusDistance(row.apparentRadiusMpc ?? row.physicalRadiusMpc, fovYRad),
      };
    case 'milkyWay':
      return {
        target: [MILKY_WAY_CENTER_WORLD[0], MILKY_WAY_CENTER_WORLD[1], MILKY_WAY_CENTER_WORLD[2]],
        distance: MILKY_WAY_VIEW_DISTANCE_MPC,
      };
  }
}
