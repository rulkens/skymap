/**
 * coreSceneBodyIds — the scene bodies core's own passes draw, by id: `SCENE_PLANETS` and the
 * frame's present mesh bodies core still owns (`CORE_MESH_BODY_IDS`). Every other body-slab
 * body is a Layer's (the missions craft), drawn by that Layer's passes. Static plus the
 * snapshot: no `state` needed.
 */

import type { MeshBody } from '../../../@types/scene/MeshBody';
import { SCENE_PLANETS } from '../../../data/bodies/scenePlanets';
import { CORE_MESH_BODY_IDS } from '../../../data/bodies/coreMeshBodyIds';

export function coreSceneBodyIds(meshBodies: readonly MeshBody[]): ReadonlySet<string> {
  const ids = new Set<string>(SCENE_PLANETS.map((body) => body.id));
  for (const body of meshBodies) if (CORE_MESH_BODY_IDS.has(body.id)) ids.add(body.id);
  return ids;
}
