/**
 * bodyMeshesPass — the body Layer's bodies with a shape model (the moons) as lit meshes on their
 * host's body-m row, through core's one mesh renderer.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import { BODY_SCENE_BODY_IDS } from '../../slabs/data/bodySceneBodyIds';
import { bodyCodeOf } from '../../selection/present/bodyCodeOf';
import { sceneBodyPickId } from '../../../../utils/picking/sceneBodyPickId';
import type { BodyRuntime } from '../../@types/BodyRuntime';
import { meshBodiesPassOver } from '../../../../services/engine/frame/meshBodiesPassOver';

export function bodyMeshesPass(runtime: Pick<BodyRuntime, 'pickCodes'>): ContentPass {
  const codeOf = bodyCodeOf(runtime.pickCodes);
  return meshBodiesPassOver('body-meshes', BODY_SCENE_BODY_IDS, (id) =>
    sceneBodyPickId(id, codeOf),
  );
}
