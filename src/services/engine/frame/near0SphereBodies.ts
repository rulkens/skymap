/**
 * near0SphereBodies — the resolved bodies NEAR0 draws as spheres: everything outside the
 * body-slab roster (`bodySlabRosterIds`). A rostered body draws in a `'body'` slab whichever
 * Layer draws it, and spanning one here would move NEAR0 in the painter order. Static rosters,
 * not the frame's slab rows, so a Layer's own slab row (the Sgr A* lens, anchored on a place)
 * never leaks in.
 */

import type { PositionedSceneBody } from '../../../@types/engine/frame/PositionedSceneBody';
import type { MeshBody } from '../../../@types/scene/MeshBody';
import { bodySlabRosterIds } from './bodySlabRosterIds';

export function near0SphereBodies(
  resolved: readonly PositionedSceneBody[],
  meshBodies: readonly MeshBody[],
): readonly PositionedSceneBody[] {
  const own = bodySlabRosterIds(meshBodies);
  return resolved.filter(({ body }) => !own.has(body.id));
}
