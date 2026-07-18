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
 * body id (the Moon's `'earth'`) resolves to that parent's already-derived
 * world position, so the Moon's ellipse rides on Earth by construction. A
 * `parentId` that names no seeded body throws loudly at module load: a typo must
 * fail, not silently place the orbit at the origin.
 */

import { RENDER_ORIGIN_MPC } from '../renderOrigin';
import { ORBITAL_ELEMENTS } from './orbitalElements';
import { SCENE_BODIES } from './sceneBodies';
import { keplerianEllipse } from '../../utils/orbit/keplerianEllipse';
import { addVec3 } from '../../utils/math/addVec3';
import { findByIdOrThrow } from '../../utils/object/findByIdOrThrow';
import type { OrbitConic } from '../../@types/scene/OrbitConic';
import type { Vec3 } from '../../@types/math/Vec3';

/**
 * Resolve an orbit's focus to an absolute-world position: `null` is the render
 * origin (heliocentric), any other id is the matching seeded body's world
 * position (geocentric etc.). `findByIdOrThrow` fails loudly on an unknown id so
 * a typo can't silently anchor the orbit at the origin.
 */
function parentWorldMpc(parentId: string | null): Readonly<Vec3> {
  if (parentId === null) return RENDER_ORIGIN_MPC;
  return findByIdOrThrow(SCENE_BODIES, parentId, 'sceneOrbitConics').positionMpc;
}

/**
 * The absolute-world orbit ellipses, one per element row. `semiMajorMpc` /
 * `semiMinorMpc` / `eccentricity` / `meanAnomalyRad` / `color` / `id` pass
 * straight through from the element and its `keplerianEllipse` shape; only the
 * centre is lifted from focus-relative to absolute world.
 */
export const SCENE_ORBIT_CONICS: readonly OrbitConic[] = ORBITAL_ELEMENTS.map((elements) => {
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
