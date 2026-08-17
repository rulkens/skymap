/**
 * sceneOrbitConics — the per-orbit absolute-world ellipse table the trail layer
 * draws, DERIVED from `ORBITAL_ELEMENTS` (spec §5).
 *
 * ### Single source of truth: elements → shape, not body → ring
 *
 * Fitting a ring to a body's placeholder position runs the dependency the wrong
 * way: such a ring only stays a circle, and a real Keplerian body is not
 * generally *on* a circle through it. We invert the dependency — elements are
 * authored once in `ORBITAL_ELEMENTS`, and BOTH the body's rendered position
 * (`keplerianPositionMpc`, in `sceneBodies.ts`) and its trail ellipse
 * (`keplerianEllipse`, here) derive from that one table. So the body sitting on
 * its own trail is structural, not a sync invariant to remember.
 *
 * ### Focus resolution: focus-relative shape → absolute-world centre
 *
 * `keplerianEllipse` returns a focus-RELATIVE `centerOffsetMpc` (C − focus) so
 * the same map serves a heliocentric planet and the geocentric Moon without
 * forking. This table folds the focus back in: the absolute centre is
 * `focusWorld + centerOffsetMpc`, where `focusWorld` comes from walking the
 * `focusId` graph — `SCENE_ANCHORS` (the Sun) are the roots, and every element
 * row's own world position is folded in once its focus is placed, via
 * `focusResolveOrder`. A chain of any depth resolves this way, the same seam
 * `deriveBodyStates` walks per instant.
 *
 * ### This is the STATIC J2000 seed — live trails re-derive per frame
 *
 * This table is the orbits frozen at J2000: it exists as a stable geometry
 * fixture (the `orbitTrails` renderer's compile-time shape reference and the
 * `composeOrbitConic` tests). The ANIMATED trails do NOT read it — once a clock
 * drives the scene, `orbitTrailsLayer` re-derives every conic per frame at the
 * frame's `simDays`, reading each moon's parent centre and each body's mean
 * anomaly from the per-frame body snapshot (`sceneBodyStates`). That
 * snapshot-reading lives in the services layer BY DESIGN: this data-layer file
 * takes no upward, layer-crossing import of a body snapshot — it walks the
 * focus graph itself, at the tabulated J2000 elements.
 *
 * At J2000 there is nothing to propagate, so each focus centre re-derives from
 * that body's OWN `ORBITAL_ELEMENTS` via `keplerianPositionMpc` — the single
 * formula `heliocentricPlanet` uses to bake it, so the two agree bit-for-bit.
 * `focusResolveOrder` throws loudly on an unknown or cyclic focus: a typo must
 * fail at derive time, not silently place the orbit at the origin.
 */

import { ORBITAL_ELEMENTS } from './orbitalElements';
import { SCENE_ANCHORS } from './sceneAnchors';
import { focusResolveOrder } from '../../utils/scene/focusResolveOrder';
import { keplerianEllipse } from '../../utils/orbit/keplerianEllipse';
import { keplerianPositionMpc } from '../../utils/orbit/keplerianPositionMpc';
import { addVec3 } from '../../utils/math/addVec3';
import type { OrbitConic } from '../../@types/scene/OrbitConic';
import type { OrbitalElements } from '../../@types/scene/OrbitalElements';
import type { AnchorBody } from '../../@types/scene/AnchorBody';
import type { Vec3 } from '../../@types/math/Vec3';

/**
 * Every focus id's absolute-world position at J2000: anchors seeded outright,
 * then every element row's own position folded in once its focus is already
 * placed (`focusResolveOrder` walks ancestors first, so a chain of any depth
 * resolves — not just a planet's own moon). Elements read at their tabulated
 * mean values, no propagation: this is the fixed epoch seed the animated
 * per-frame derivation (`deriveBodyStates`) reproduces bit-for-bit at J2000.
 */
function worldPositionsMpc(
  anchors: readonly AnchorBody[],
  elements: readonly OrbitalElements[],
): ReadonlyMap<string, Readonly<Vec3>> {
  const positions = new Map<string, Readonly<Vec3>>();
  for (const anchor of anchors) positions.set(anchor.id, anchor.positionMpc);
  for (const el of focusResolveOrder(anchors, elements)) {
    positions.set(el.id, addVec3(positions.get(el.focusId)!, keplerianPositionMpc(el)));
  }
  return positions;
}

/**
 * Derive the static J2000 orbit ellipses, one per element row. `semiMajorMpc` /
 * `semiMinorMpc` / `eccentricity` / `meanAnomalyRad` / `color` / `id` pass
 * straight through from the element and its `keplerianEllipse` shape; only the
 * centre is lifted from focus-relative to absolute world. No propagation — the
 * elements are read at their tabulated J2000 mean values. The per-frame,
 * clock-driven derivation is `orbitTrailsLayer`'s (which reads the body
 * snapshot); this stays a data-layer builder of the fixed epoch geometry.
 *
 * `anchors`/`elements` default to the real tables; a test can inject a
 * synthetic pair — mirroring `focusResolveOrder`'s own signature — to exercise
 * an anchor focus without seeding one into shipped data.
 */
export function deriveOrbitConics(
  anchors: readonly AnchorBody[] = SCENE_ANCHORS,
  elements: readonly OrbitalElements[] = ORBITAL_ELEMENTS,
): readonly OrbitConic[] {
  const worldPositions = worldPositionsMpc(anchors, elements);
  return elements.map((el) => {
    const { centerOffsetMpc, semiMajorMpc, semiMinorMpc } = keplerianEllipse(el);
    return {
      id: el.id,
      centerMpc: addVec3(worldPositions.get(el.focusId)!, centerOffsetMpc),
      semiMajorMpc,
      semiMinorMpc,
      eccentricity: el.eccentricity,
      meanAnomalyRad: el.meanAnomalyRad,
      color: el.color,
    };
  });
}

/**
 * The static J2000 orbit conics — the compile-time geometry fixture the
 * `orbitTrails` renderer and the `composeOrbitConic` tests read. The animated
 * trails re-derive per frame in `orbitTrailsLayer`; this reproduces the epoch
 * geometry value-for-value.
 */
export const SCENE_ORBIT_CONICS: readonly OrbitConic[] = deriveOrbitConics();
