/**
 * near0SphereBodies — LEFTOVER (T7-5), deleted by the bodies-into-Layers PR's per-body slab
 * field: the resolved bodies NEAR0 draws, outside core's own rosters. A body with a slab row
 * of its own, or riding a host's (the mesh roster), draws in a `'body'` slab; spanning it
 * would move NEAR0 in the painter order.
 */

import type { PositionedSceneBody } from '../../../@types/engine/frame/PositionedSceneBody';
import type { SlabRow } from '../../../@types/engine/frame/SlabRow';
import type { MeshBody } from '../../../@types/scene/MeshBody';

export function near0SphereBodies(
  resolved: readonly PositionedSceneBody[],
  rosters: { slabBodyCandidates: readonly SlabRow[]; meshBodies: readonly MeshBody[] },
): readonly PositionedSceneBody[] {
  const own = new Set<string>(rosters.slabBodyCandidates.map((row) => row.anchorId));
  for (const body of rosters.meshBodies) own.add(body.id);
  return resolved.filter(({ body }) => !own.has(body.id));
}
