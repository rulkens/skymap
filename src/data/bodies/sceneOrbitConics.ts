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
 * ### Parent resolution: focus-relative shape → absolute-world centre
 *
 * `keplerianEllipse` returns a focus-RELATIVE `centerOffsetMpc` (C − focus) so
 * the same map serves a heliocentric planet and the geocentric Moon without
 * forking. This table folds the focus back in: the absolute centre is
 * `parentWorld + centerOffsetMpc`, where `parentWorld` is resolved from
 * `parentId` — `null` is heliocentric (the render origin, i.e. the Sun) and a
 * body id (the Moon's `'earth'`) resolves to that parent's world position, so
 * the Moon's ellipse rides on Earth by construction.
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
 * takes no upward, layer-crossing import of a body snapshot.
 *
 * At J2000 there is nothing to propagate, so the parent centre re-derives from
 * the parent's OWN `ORBITAL_ELEMENTS` via `keplerianPositionMpc` — the single
 * formula `heliocentricPlanet` uses to bake the parent, so the two agree
 * bit-for-bit. `parentId` is resolved through `elementsById`, which throws
 * loudly on an unknown id: a typo must fail at derive time, not silently place
 * the orbit at the origin.
 */

import { RENDER_ORIGIN_MPC } from '../renderOrigin';
import { ORBITAL_ELEMENTS, elementsById } from './orbitalElements';
import { keplerianEllipse } from '../../utils/orbit/keplerianEllipse';
import { keplerianPositionMpc } from '../../utils/orbit/keplerianPositionMpc';
import { addVec3 } from '../../utils/math/addVec3';
import type { OrbitConic } from '../../@types/scene/OrbitConic';
import type { Vec3 } from '../../@types/math/Vec3';

/**
 * Resolve an orbit's focus to an absolute-world position: `null` is the render
 * origin (heliocentric); any other id re-derives that parent's world position
 * from its OWN elements (`RENDER_ORIGIN_MPC + keplerianPositionMpc`) — every
 * moon parent is itself heliocentric, so one hop suffices. This builder emits
 * the fixed J2000-epoch geometry, so the parent is taken at its tabulated mean
 * position; `elementsById` throws loudly on an unknown id.
 */
function parentWorldMpc(parentId: string | null): Readonly<Vec3> {
  if (parentId === null) return RENDER_ORIGIN_MPC;
  return addVec3(RENDER_ORIGIN_MPC, keplerianPositionMpc(elementsById(parentId)));
}

/**
 * Derive the static J2000 orbit ellipses, one per element row. `semiMajorMpc` /
 * `semiMinorMpc` / `eccentricity` / `meanAnomalyRad` / `color` / `id` pass
 * straight through from the element and its `keplerianEllipse` shape; only the
 * centre is lifted from focus-relative to absolute world. No propagation — the
 * elements are read at their tabulated J2000 mean values. The per-frame,
 * clock-driven derivation is `orbitTrailsLayer`'s (which reads the body
 * snapshot); this stays a data-layer builder of the fixed epoch geometry.
 */
export function deriveOrbitConics(): readonly OrbitConic[] {
  return ORBITAL_ELEMENTS.map((elements) => {
    const { centerOffsetMpc, semiMajorMpc, semiMinorMpc } = keplerianEllipse(elements);
    const parent = parentWorldMpc(elements.parentId);
    return {
      id: elements.id,
      centerMpc: addVec3(parent, centerOffsetMpc),
      semiMajorMpc,
      semiMinorMpc,
      eccentricity: elements.eccentricity,
      meanAnomalyRad: elements.meanAnomalyRad,
      color: elements.color,
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
