/**
 * bodySlabRosterIds — ids of every scene body drawn on a body slab, whichever Layer
 * draws it: `SCENE_PLANETS` plus the present mesh bodies. `near0SphereBodies` drops
 * these and the probe scheduler captures from them.
 */

import type { MeshBody } from '../../../@types/scene/MeshBody';
import { SCENE_PLANETS } from '../../../data/bodies/scenePlanets';

export function bodySlabRosterIds(meshBodies: readonly MeshBody[]): ReadonlySet<string> {
  const ids = new Set<string>(SCENE_PLANETS.map((body) => body.id));
  for (const body of meshBodies) ids.add(body.id);
  return ids;
}
