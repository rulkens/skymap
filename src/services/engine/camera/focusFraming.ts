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
 *   - body / star: both are discrete near-field objects framed on a physical
 *     radius through the FOV, so they share `bodyLikeFraming` — unclamped pure
 *     math, because at ~2e-16 Mpc (Earth) any Mpc-scale floor would swallow the
 *     framing. `radius` is the physical radius, a real pass-by extent. Their row
 *     shapes differ (body: id/label; star: index/photometry + a nominal solar
 *     radius, the bin having no per-star size), so the cases stay separate.
 *
 * The return type is `Pick<CameraPose, 'target' | 'distance'>` plus the subject's
 * pass-by `radius` (Mpc) — the position-and-depth slice, with the extent a fly-past
 * offset scales by (0 = fly through-centre). Callers carry the orientation
 * (yaw/pitch) themselves; the radius is ignored by the framing consumers and read
 * only by `flyPath`'s pass-by geometry.
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
    // A seeded body and a survey star differ in row shape but frame identically:
    // a discrete near-field object sized on its physical radius. Both delegate
    // to the shared bodyLikeFraming; the star's radius is the extractor-stamped
    // nominal solar radius (the bin has no per-star size).
    case 'body':
      return bodyLikeFraming(row.positionMpc, row.radiusKm, fovYRad);
    case 'star':
      return bodyLikeFraming(row.positionMpc, row.radiusKm, fovYRad);
    // The band carries no x/y/z (a line-of-sight effect, not a point), so it
    // has no pose to fabricate. UNREACHABLE BY CONSTRUCTION: every
    // `updateSelectionFocus` dispatch — InfoCard, double-click, keyboard
    // shortcut, deep link, tour restore — funnels through the single
    // `takeLatest(updateSelectionFocus, …)` worker in `watchFocusTweenSaga`,
    // which filters a `zoneOfAvoidance` row before it ever reaches
    // `focusTweenDescriptor`/`focusFraming` (that's the ONE enforcement site —
    // do not add a second filter here or elsewhere). The clip-authoring path
    // (`resolveClipFoci`) is separately unreachable: `urlHashFor`/`focusIdOf`
    // never encode this arm, so no `FocusId` can decode back to it. This throw
    // is therefore a should-never-happen assertion, not a live error path.
    case 'zoneOfAvoidance':
      throw new Error('focusFraming: zoneOfAvoidance has no focus target');
  }
}
