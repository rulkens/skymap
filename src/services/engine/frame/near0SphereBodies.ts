/**
 * near0SphereBodies — LEFTOVER (T7-5), deleted by the bodies-into-Layers PR's per-body slab
 * field: the resolved bodies NEAR0 draws, outside core's own rosters (the planets and the mesh
 * bodies), each of which draws in a `'body'` slab; spanning one would move NEAR0 in the painter
 * order. The rosters, not the frame's slab rows, so a Layer's own slab row never leaks in.
 */

import type { PositionedSceneBody } from '../../../@types/engine/frame/PositionedSceneBody';
import type { PlanetBody } from '../../../@types/scene/PlanetBody';
import type { MeshBody } from '../../../@types/scene/MeshBody';

export function near0SphereBodies(
  resolved: readonly PositionedSceneBody[],
  rosters: { planets: readonly PlanetBody[]; meshBodies: readonly MeshBody[] },
): readonly PositionedSceneBody[] {
  const own = new Set<string>(rosters.planets.map((body) => body.id));
  for (const body of rosters.meshBodies) own.add(body.id);
  return resolved.filter(({ body }) => !own.has(body.id));
}
