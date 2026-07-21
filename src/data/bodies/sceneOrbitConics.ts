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
 * ### Why the parent centre re-derives from elements, not a baked snapshot
 *
 * A moon's parent world position could be read off `SCENE_BODIES` (the parent's
 * load-time baked `positionMpc`), and that is what this file used to do. But
 * that snapshot is frozen at J2000: once a clock animates the trails (§3), a
 * moon's trail centre must ride the parent's *current* position, and a
 * load-time baked value cannot move. So we re-derive the parent centre from the
 * parent's OWN `ORBITAL_ELEMENTS` via `keplerianPositionMpc` — the very same map
 * the parent's body position and trail already flow through. This is not a
 * mirror: `keplerianPositionMpc` is the single formula, evaluated here at the
 * parent's elements exactly as `heliocentricPlanet` evaluates it to bake the
 * parent, so the two agree bit-for-bit. It also keeps this file in the DATA
 * layer (elements → conics), reading no services-layer body snapshot — an
 * upward, layer-crossing import the derive must not take.
 *
 * `parentId` is resolved through `elementsById`, which throws loudly on an
 * unknown id: a typo must fail at derive time, not silently place the orbit at
 * the origin.
 */

import { RENDER_ORIGIN_MPC } from '../renderOrigin';
import { CONST_J2000 } from '../time/constJ2000';
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
 * moon parent is itself heliocentric, so one hop suffices. Re-deriving (rather
 * than reading a baked snapshot) is what lets the centre ride a moving parent
 * once trails animate; `elementsById` throws loudly on an unknown id.
 */
function parentWorldMpc(parentId: string | null): Readonly<Vec3> {
  if (parentId === null) return RENDER_ORIGIN_MPC;
  return addVec3(RENDER_ORIGIN_MPC, keplerianPositionMpc(elementsById(parentId)));
}

/**
 * Derive the absolute-world orbit ellipses, one per element row. `semiMajorMpc`
 * / `semiMinorMpc` / `eccentricity` / `meanAnomalyRad` / `color` / `id` pass
 * straight through from the element and its `keplerianEllipse` shape; only the
 * centre is lifted from focus-relative to absolute world.
 *
 * `simDays` is the prep seam, mirroring `deriveBodyStates`: rate propagation
 * (02-core) will read it to advance each body's — and each parent's — mean
 * anomaly from the epoch, moving both the ellipse and the parent centre it rides
 * on. At prep there is no propagation: every orbit is evaluated at its tabulated
 * J2000 mean elements regardless of `simDays`, so the parameter is deliberately
 * unread here. It exists now so consumers can bind to the final signature.
 */
export function deriveOrbitConics(simDays: number): readonly OrbitConic[] {
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
 * The static J2000 orbit conics every current consumer (`orbitTrailsLayer`,
 * tests) reads — `deriveOrbitConics` evaluated at the epoch the elements are
 * authored for, reproducing the previously baked table value-for-value.
 */
export const SCENE_ORBIT_CONICS: readonly OrbitConic[] = deriveOrbitConics(CONST_J2000);
