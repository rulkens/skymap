/**
 * near0SphereBodies — LEFTOVER (T7-5), deleted by the bodies-into-Layers PR's per-body slab
 * field: the resolved bodies NEAR0 draws, outside core's own (`coreSceneBodyIds`), each of
 * which draws in a `'body'` slab; spanning one would move NEAR0 in the painter order. Core's
 * rosters, not the frame's slab rows, so a Layer's own slab row never leaks in.
 */

import type { PositionedSceneBody } from '../../../@types/engine/frame/PositionedSceneBody';
import type { MeshBody } from '../../../@types/scene/MeshBody';
import { coreSceneBodyIds } from './coreSceneBodyIds';

export function near0SphereBodies(
  resolved: readonly PositionedSceneBody[],
  meshBodies: readonly MeshBody[],
): readonly PositionedSceneBody[] {
  const own = coreSceneBodyIds(meshBodies);
  return resolved.filter(({ body }) => !own.has(body.id));
}
