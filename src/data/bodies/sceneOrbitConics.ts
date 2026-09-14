/**
 * sceneOrbitConics — the per-orbit absolute-world ellipse table the trail layer
 * draws, DERIVED from `TRAIL_ELEMENTS` (spec §5) and frozen at J2000. The live
 * trails do NOT read it: `orbitTrailsPass` re-derives every conic per frame off
 * the body snapshot. That snapshot-reading stays in the services layer BY
 * DESIGN — this data-layer file takes no upward, layer-crossing import and
 * walks the focus graph itself. `focusResolveOrder` throws on an unknown or
 * cyclic focus, so a typo fails at derive time rather than silently placing an
 * orbit at the origin.
 */

import { TRAIL_ELEMENTS } from './trailElements';
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
 * Every focus id's absolute-world position at J2000: anchors outright, then each
 * element row folded in once its focus is placed, so a chain of any depth
 * resolves. Read at the tabulated means, no propagation — `deriveBodyStates`
 * reproduces these bit-for-bit at J2000.
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
 * `anchors`/`elements` default to the real tables; a test can inject a synthetic
 * pair — mirroring `focusResolveOrder`'s own signature — to exercise an anchor
 * focus without seeding one into shipped data.
 */
export function deriveOrbitConics(
  anchors: readonly AnchorBody[] = SCENE_ANCHORS,
  elements: readonly OrbitalElements[] = TRAIL_ELEMENTS,
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

/** The J2000 fixture the `orbitTrails` renderer and the `composeOrbitConic` tests read. */
export const SCENE_ORBIT_CONICS: readonly OrbitConic[] = deriveOrbitConics();
