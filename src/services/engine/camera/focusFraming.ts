/**
 * focusFraming — the SelectionRow→pose resolver shared by the focus tween and the tour's
 * visitBeatSaga. Callers carry the orientation (yaw/pitch); `radius` is read only by `flyPath`.
 *
 * `bodyLikeFraming` is unclamped on purpose: at ~2e-16 Mpc (Earth) any Mpc-scale floor
 * would swallow the framing. A driver's `focusDistanceRadii` (e.g. Sgr A*'s ~30.4 r_s)
 * overrides the screen-fill distance with a fixed radius multiple.
 */

import { galaxyFocusDistance } from './galaxyFocusDistance';
import { structureFocusDistance } from './structureFocusDistance';
import { bodyLikeFraming } from './bodyLikeFraming';
import {
  MILKY_WAY_CENTER_WORLD,
  MILKY_WAY_VIEW_DISTANCE_MPC,
} from '../../../data/milkyWay/galacticCenter';
import type { SelectionRow } from '../../../@types/engine/SelectionRow';
import type { CameraPose } from '../../../@types/camera/CameraPose';

/** kpc → Mpc; the fallback diameter mirrors `galaxyFocusDistance`. */
const KPC_PER_MPC = 1000;
const FALLBACK_DIAMETER_KPC = 30;

export type FocusFraming = Pick<CameraPose, 'target' | 'distance'> & {
  /** Pass-by extent (Mpc) a fly-past offset scales by; 0 = flown into, not past. */
  readonly radius: number;
};

export function focusFraming(row: SelectionRow, fovYRad: number): FocusFraming {
  switch (row.type) {
    case 'galaxyCatalog': {
      const dKpc =
        Number.isFinite(row.diameterKpc) && row.diameterKpc > 0
          ? row.diameterKpc
          : FALLBACK_DIAMETER_KPC;
      return {
        target: [row.x, row.y, row.z],
        distance: galaxyFocusDistance(row.diameterKpc),
        radius: dKpc / 2 / KPC_PER_MPC,
      };
    }
    case 'structure':
      return {
        target: [row.worldPos[0], row.worldPos[1], row.worldPos[2]],
        // The wider apparent extent is what the close-approach fade reads, so ring + label land past their fade-out.
        distance: structureFocusDistance(row.apparentRadiusMpc ?? row.physicalRadiusMpc, fovYRad),
        // A volume you fly INTO, not past: `flyPath` skips knots with radius ≤ 0.
        radius: 0,
      };
    case 'milkyWay':
      return {
        target: [MILKY_WAY_CENTER_WORLD[0], MILKY_WAY_CENTER_WORLD[1], MILKY_WAY_CENTER_WORLD[2]],
        distance: MILKY_WAY_VIEW_DISTANCE_MPC,
        radius: 0,
      };
    case 'body':
    case 'craft':
    case 'earthScene':
    case 'starCatalog':
    case 'blackHole':
    case 'satellite':
      return bodyLikeFraming(
        row.positionMpc,
        row.driver.footprintRadiusM,
        fovYRad,
        row.driver.focusDistanceRadii,
      );
    // Unreachable by construction: `watchFocusTweenSaga` filters on `ROW_FOCUSABLE` (the one
    // enforcement site; do not add a second), and `urlHashFor` never encodes this arm.
    case 'zoneOfAvoidance':
      throw new Error('focusFraming: zoneOfAvoidance has no focus target');
  }
}
