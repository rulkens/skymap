/**
 * deriveBodyStates — derives every scene body's time-varying `BodyState` from
 * the three authored position tables — anchors, Keplerian elements, surface
 * sites (`positionDrivers.ts` reads the same three as a union) — keyed by id.
 * `meanAnomalyRad` is the PROPAGATED `M` at `t` (not epoch) — the
 * orbit-trail falloff anchor, so a trail fading behind the body must
 * track where it actually is. Memoized on `simDays`: every pass (draw,
 * pick, labels) reads the same snapshot each frame, so recomputing per
 * reader would tear a mid-frame clock tick between passes.
 */

import type { BodyId } from '../../../@types/data/body/BodyId';
import type { BodyState } from '../../../@types/scene/BodyState';
import type { TerrainHeightAtLookup } from '../../../@types/camera/TerrainHeightAtLookup';
import type { Vec3 } from '../../../@types/math/Vec3';
import { ORBITAL_ELEMENTS } from '../../../data/bodies/orbitalElements';
import { SCENE_ANCHORS } from '../../../data/bodies/sceneAnchors';
import { SCENE_CELESTIAL_BODIES } from '../../../data/bodies/sceneCelestialBodies';
import { SURFACE_FIXED_SITES } from '../../../data/bodies/surfaceFixedSites';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { orientationForBody } from '../../../data/bodies/orientationForBody';
import { propagateElements } from '../../../utils/orbit/propagateElements';
import { keplerianPositionMpc } from '../../../utils/orbit/keplerianPositionMpc';
import { focusResolveOrder } from '../../../utils/scene/focusResolveOrder';
import { surfacePointBodyFixed } from '../../../utils/geo/surfacePointBodyFixed';
import { addVec3 } from '../../../utils/math/addVec3';
import { rotateVec3ByTightMat3 } from '../../../utils/math/rotateVec3ByTightMat3';
import { findByIdOrThrow } from '../../../utils/object/findByIdOrThrow';

// The focus graph is authored, static data, so its order is resolved once at
// module load and replayed every instant: the per-frame cost stays one linear
// pass, and a cycle or a dangling focus fails at import — where an authoring
// mistake belongs — instead of on whichever frame first reaches the bad row.
const FOCUS_ORDER = focusResolveOrder(SCENE_ANCHORS, ORBITAL_ELEMENTS);

// The last computed snapshot, keyed by the instant it was computed at. A frame
// re-reads the same instant from several passes and a paused clock re-reads it
// every frame, so a one-deep cache makes both free; a new instant recomputes.
let cachedSimDays: number | undefined;
let cachedStates: ReadonlyMap<string, BodyState> | undefined;

/**
 * `terrainHeightAt` defaults to 0 (datum only); the one-deep memo below means
 * whichever call first hits a given `simDays` decides it for every same-instant
 * reader — a paused clock holds a rover's height stale exactly as it already
 * holds every other body's position stale.
 */
export function deriveBodyStates(
  simDays: number,
  terrainHeightAt: TerrainHeightAtLookup = () => 0,
): ReadonlyMap<string, BodyState> {
  if (cachedStates !== undefined && simDays === cachedSimDays) {
    return cachedStates;
  }

  // Phase 1 — positions only, so phase 2 can orient a body against where the
  // *other* bodies ended up rather than against iteration order.
  const positions = new Map<string, Vec3>();
  const meanAnomalies = new Map<string, number>();

  // 1a — the roots: position authored, not orbited, and M = 0: an anchor has
  // no orbit for a trail to fade along. The authored position is shared by
  // reference rather than copied: it is never mutated, and a copy would
  // allocate per instant for nothing.
  for (const anchor of SCENE_ANCHORS) {
    positions.set(anchor.id, anchor.positionMpc);
    meanAnomalies.set(anchor.id, 0);
  }

  // 1b — every element row, focus before dependant. The focus is already in
  // the map by construction of `FOCUS_ORDER`, which is also where an unknown
  // focus id throws — so the lookup here is total.
  for (const el of FOCUS_ORDER) {
    const focus = positions.get(el.focusId)!;
    const propagated = propagateElements(el, simDays);
    positions.set(el.id, addVec3(focus, keplerianPositionMpc(propagated)));
    meanAnomalies.set(el.id, propagated.meanAnomalyRad);
  }

  // 1c — sites pinned to a host's surface: the host's own spin carries them, so
  // the host's orientation is needed HERE, mid-phase-1. Safe because every such
  // host is an IAU-pole body and that arm ignores `positions`. M = 0, as for an
  // anchor: no orbit for a trail to fade along.
  for (const site of SURFACE_FIXED_SITES) {
    const hostPos = positions.get(site.hostId);
    if (hostPos === undefined) {
      throw new Error(
        `deriveBodyStates: site '${site.id}' names unpositioned host '${site.hostId}'`,
      );
    }
    // The ground radius, so `SCENE_CELESTIAL_BODIES`: a site is pinned to a
    // surface, which is exactly what a mesh body's hull is not.
    const { surface } = findByIdOrThrow(SCENE_CELESTIAL_BODIES, site.hostId, 'deriveBodyStates');
    // Mirrors `sitePointBodyFixed`'s own expression (F3a, spec §8.3) — kept as
    // two independent copies on purpose (that file's header comment), so the
    // cross-file contract test is what proves they still agree.
    const dirBodyFixed = surfacePointBodyFixed(site.latDeg, site.lonDeg, 1);
    const radiusM =
      surface.datumRadiusM + terrainHeightAt(site.hostId as BodyId, dirBodyFixed) + site.altitudeM;
    const offsetM = rotateVec3ByTightMat3(
      [dirBodyFixed[0] * radiusM, dirBodyFixed[1] * radiusM, dirBodyFixed[2] * radiusM],
      orientationForBody(site.hostId, simDays, positions),
    );
    // Metres → Mpc BEFORE the host's heliocentric position joins in: adding
    // first would round a few-thousand-km offset off an au-scale magnitude.
    const offsetMpc: Vec3 = [
      offsetM[0] * SCALE_UNITS.M_TO_MPC,
      offsetM[1] * SCALE_UNITS.M_TO_MPC,
      offsetM[2] * SCALE_UNITS.M_TO_MPC,
    ];
    positions.set(site.id, addVec3(hostPos, offsetMpc));
    meanAnomalies.set(site.id, 0);
  }

  // Phase 2 — orientations over the finished position map. Anchors go through
  // `orientationForBody` too, so the rotation-row gate stays one gate.
  const states = new Map<string, BodyState>();
  for (const [id, positionMpc] of positions) {
    states.set(id, {
      positionMpc,
      orientation: orientationForBody(id, simDays, positions),
      meanAnomalyRad: meanAnomalies.get(id)!,
    });
  }

  cachedSimDays = simDays;
  cachedStates = states;
  return states;
}
