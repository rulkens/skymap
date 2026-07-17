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
 *   - galaxyCatalog: physical diameter drives the distance via `galaxyFocusDistance`;
 *     `radius` is the galaxy's half-diameter (Mpc) — a real pass-by extent.
 *   - structure: apparent extent through the projection FOV via `structureFocusDistance`;
 *     the `apparentRadiusMpc ?? physicalRadiusMpc` fallback ensures every
 *     structure record resolves to a sensible distance. `radius` is 0 — pass-by
 *     is a galaxy idiom, so a flyPath flies INTO a cluster, never past it.
 *   - milkyWay: fixed world-space centre at a calibrated view distance — we are
 *     inside the galaxy, so no radius or FOV computation makes sense; `radius` 0.
 *   - body: the seeded body's absolute position, framed on its physical radius
 *     through the FOV via `bodyFocusDistance` — unclamped pure math, because at
 *     ~2e-16 Mpc (Earth) any Mpc-scale floor would swallow the framing. `radius`
 *     is the body's physical radius — a discrete object, so a real pass-by extent.
 *
 * The return type is `Pick<CameraPose, 'target' | 'distance'>` plus the subject's
 * pass-by `radius` (Mpc) — the position-and-depth slice, with the extent a fly-past
 * offset scales by (0 = fly through-centre). Callers carry the orientation
 * (yaw/pitch) themselves; the radius is ignored by the framing consumers and read
 * only by `flyPath`'s pass-by geometry.
 */

import { galaxyFocusDistance } from './galaxyFocusDistance';
import { structureFocusDistance } from './structureFocusDistance';
import { bodyFocusDistance } from './bodyFocusDistance';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import {
  MILKY_WAY_CENTER_WORLD,
  MILKY_WAY_VIEW_DISTANCE_MPC,
} from '../../../data/milkyWay/galacticCenter';
import type { SelectionRow } from '../../../@types/engine/SelectionRow';
import type { CameraPose } from '../../../@types/camera/CameraPose';

/** kpc → Mpc; the fallback diameter mirrors `galaxyFocusDistance`. */
const KPC_PER_MPC = 1000;
const FALLBACK_DIAMETER_KPC = 30;

/**
 * Nominal stellar radius (km) for framing a picked survey star. The star row
 * carries no per-star radius — the bin quantises position + photometry only —
 * so a single representative solar radius (Sun ≈ 6.957e5 km) frames every star
 * as a discrete near-field body through the shared `bodyFocusDistance`. The
 * FieldStarInfo view-model derives distance / photometry / spectral class but no
 * physical size (the photometry can't support one), so framing stays on this
 * representative radius rather than an absMag-derived guess.
 */
const NOMINAL_STAR_RADIUS_KM = 6.957e5;

export type FocusFraming = Pick<CameraPose, 'target' | 'distance'> & {
  /**
   * The subject's pass-by extent (Mpc) — the unit a fly-past offset scales by.
   * A galaxy's half-diameter; 0 for structures / the Milky Way (flown into, not
   * past), which zeroes their lateral offset.
   */
  readonly radius: number;
};

/**
 * Compute the target world position, orbit distance, and subject radius
 * appropriate for a focus on the given resolved row, given the camera's current
 * vertical FOV.
 *
 * Returns the fields that change on a focus (orientation is the caller's) plus
 * the subject radius.
 */
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
        // Frame on the WIDER apparent extent — the radius the close-approach
        // fade reads — so the ring + label land just past their fade-out;
        // fall back to the physical core when there is no wider extent.
        distance: structureFocusDistance(row.apparentRadiusMpc ?? row.physicalRadiusMpc, fovYRad),
        // Pass-by is a galaxy idiom (swoop beside a discrete object). A cluster /
        // group / supercluster is a volume you fly INTO, so its pass-by extent is
        // 0 — the flyPath offset loop skips any knot with radius ≤ 0.
        radius: 0,
      };
    case 'milkyWay':
      return {
        target: [MILKY_WAY_CENTER_WORLD[0], MILKY_WAY_CENTER_WORLD[1], MILKY_WAY_CENTER_WORLD[2]],
        distance: MILKY_WAY_VIEW_DISTANCE_MPC,
        // We are inside the galaxy; there is no meaningful fly-past radius.
        radius: 0,
      };
    case 'body': {
      // Physical radius in Mpc (Earth: 6371 km ≈ 2.06e-16 Mpc). The distance
      // is pure screen-fill math with NO clamp — the wheel-zoom / descent
      // clamps own the floor, and any Mpc-scale minimum here would park the
      // camera ~5e14 body-radii out. The wheel-zoom floor (clampDistance.ts:
      // MIN_DISTANCE_MPC) reaches Earth-surface scale, keeping this reachable
      // in practice.
      const radiusMpc = row.radiusKm * SCALE_UNITS.KM_TO_MPC;
      return {
        target: [row.positionMpc[0], row.positionMpc[1], row.positionMpc[2]],
        distance: bodyFocusDistance(radiusMpc, fovYRad),
        // A body is a discrete object like a galaxy, so its physical radius is
        // a real pass-by extent for flyPath's offset geometry.
        radius: radiusMpc,
      };
    }
    case 'star': {
      // A survey star is a discrete near-field point framed like a body, using
      // a nominal stellar radius (the row has no per-star size) — see
      // NOMINAL_STAR_RADIUS_KM.
      const radiusMpc = NOMINAL_STAR_RADIUS_KM * SCALE_UNITS.KM_TO_MPC;
      return {
        target: [row.positionMpc[0], row.positionMpc[1], row.positionMpc[2]],
        distance: bodyFocusDistance(radiusMpc, fovYRad),
        radius: radiusMpc,
      };
    }
  }
}
