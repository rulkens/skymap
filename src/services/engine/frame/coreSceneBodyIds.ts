/**
 * coreSceneBodyIds — the one definition of core's own scene bodies, by id: `SCENE_PLANETS`
 * (the table `createEngineData` seeds the planet store from) and the frame's present mesh
 * bodies. `sceneBodyPartition` keeps these and `near0SphereBodies` drops them, so the two
 * stay complementary by construction. Static plus the snapshot: no `state` needed.
 */

import type { MeshBody } from '../../../@types/scene/MeshBody';
import { SCENE_PLANETS } from '../../../data/bodies/scenePlanets';

export function coreSceneBodyIds(meshBodies: readonly MeshBody[]): ReadonlySet<string> {
  const ids = new Set<string>(SCENE_PLANETS.map((body) => body.id));
  for (const body of meshBodies) ids.add(body.id);
  return ids;
}
