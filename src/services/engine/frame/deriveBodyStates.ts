/**
 * deriveBodyStates — derives every scene body's time-varying `BodyState` from
 * the three authored position tables — anchors, Keplerian elements, surface
 * sites (`positionDrivers.ts` reads the same three as a union) — keyed by id.
 * A body is Kepler plus its fitted Horizons correction, less any pair reflex;
 * a moon's correction also shifts M before Kepler, so it stays on its conic.
 * `orbit` is the PROPAGATED element set at `t` the body was placed with, so
 * the orbit trail draws the same conic instead of re-deriving its own.
 * Memoized on `simDays` and the trajectory registry version: every pass (draw, pick, labels) reads the same
 * snapshot each frame, so recomputing per reader would tear a mid-frame
 * clock tick between passes.
 */

import type { BodyState } from '../../../@types/scene/BodyState';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { OrbitalElements } from '../../../@types/scene/OrbitalElements';
import { ORBITAL_ELEMENTS } from '../../../data/bodies/orbitalElements';
import { SCENE_ANCHORS } from '../../../data/bodies/sceneAnchors';
import { SCENE_CELESTIAL_BODIES } from '../../../data/bodies/sceneCelestialBodies';
import { SURFACE_FIXED_SITES } from '../../../data/bodies/surfaceFixedSites';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { orientationForBody } from '../../../data/bodies/orientationForBody';
import { focusResolveOrder } from '../../../utils/scene/focusResolveOrder';
import { siteGroundRadiusM } from '../../../utils/camera/siteGroundRadiusM';
import { sitePointBodyFixed } from '../../../utils/camera/sitePointBodyFixed';
import { addVec3 } from '../../../utils/math/addVec3';
import { rotateVec3ByTightMat3 } from '../../../utils/math/rotateVec3ByTightMat3';
import { findByIdOrThrow } from '../../../utils/object/findByIdOrThrow';
import { SAMPLED_BODIES } from '../../../data/missions/spacecraftBodies';
import { orbitRowPlacement } from '../../../utils/orbit/orbitRowPlacement';
import { bodyPositionMpcAt } from '../../../utils/exhibits/mission/bodyPositionMpcAt';
import { trajectoryRegistry } from '../../bodies/trajectoryRegistry';

// The focus graph is authored, static data, so its order is resolved once at
// module load and replayed every instant: the per-frame cost stays one linear
// pass, and a cycle or a dangling focus fails at import — where an authoring
// mistake belongs — instead of on whichever frame first reaches the bad row.
const FOCUS_ORDER = focusResolveOrder(SCENE_ANCHORS, ORBITAL_ELEMENTS);

// The last computed snapshot, keyed by the instant and the trajectory registry
// version it was computed at. A frame re-reads the same instant from several
// passes and a paused clock re-reads it every frame, so a one-deep cache makes
// both free; a new instant, or a track arriving on a paused clock, recomputes.
let cache: { simDays: number; version: number; states: ReadonlyMap<string, BodyState> } | undefined;

export function deriveBodyStates(simDays: number): ReadonlyMap<string, BodyState> {
  const version = trajectoryRegistry.version();
  if (cache !== undefined && simDays === cache.simDays && version === cache.version) {
    return cache.states;
  }

  // Phase 1 — positions only, so phase 2 can orient a body against where the
  // *other* bodies ended up rather than against iteration order.
  const positions = new Map<string, Vec3>();
  const orbits = new Map<string, OrbitalElements>();

  // 1a — the roots: position authored, not orbited, so no orbit. The authored
  // position is shared by reference rather than copied: it is never mutated,
  // and a copy would allocate per instant for nothing.
  for (const anchor of SCENE_ANCHORS) {
    positions.set(anchor.id, anchor.positionMpc);
  }

  // 1b — every element row, focus before dependant. The focus is already in
  // the map by construction of `FOCUS_ORDER`, which is also where an unknown
  // focus id throws — so the lookup here is total.
  for (const el of FOCUS_ORDER) {
    const focus = positions.get(el.focusId)!;
    const { positionMpc: position, orbit: propagated } = orbitRowPlacement(el, focus, simDays);
    positions.set(el.id, position);
    orbits.set(el.id, propagated);
  }

  // 1c — sites pinned to a host's surface: the host's own spin carries them, so
  // the host's orientation is needed HERE, mid-phase-1. Safe because every such
  // host is an IAU-pole body and that arm ignores `positions`. No orbit, as for
  // an anchor.
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
    const offsetM = rotateVec3ByTightMat3(
      sitePointBodyFixed(site, siteGroundRadiusM(site, surface.datumRadiusM)),
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
  }

  // 1d — sampled craft, off the same walk the mission camera samples. With no track the
  // craft sits at Earth, so the state always exists (22 sites do `states.get(id)!`) and the
  // presence gate, not this phase, decides whether the craft is drawn.
  for (const { id } of SAMPLED_BODIES) positions.set(id, bodyPositionMpcAt(id, simDays));

  // Phase 2 — orientations over the finished position map. Anchors go through
  // `orientationForBody` too, so the rotation-row gate stays one gate.
  const states = new Map<string, BodyState>();
  for (const [id, positionMpc] of positions) {
    states.set(id, {
      positionMpc,
      orientation: orientationForBody(id, simDays, positions),
      orbit: orbits.get(id),
    });
  }

  cache = { simDays, version, states };
  return states;
}
