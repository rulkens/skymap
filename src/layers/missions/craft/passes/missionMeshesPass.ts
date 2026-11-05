/**
 * missionMeshesPass — the craft as lit meshes on their host's body-m row, through core's one
 * mesh handle (`state.gpu.meshBodyRenderer`; the slots stay core's), stamping the craft pick code.
 */

import { meshBodiesPassOver } from '../../../../services/engine/frame/meshBodiesPassOver';
import { MISSION_CRAFT_IDS } from '../present/missionCraftIds';
import { craftPickId } from '../present/craftPickId';
import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import type { MissionsRuntime } from '../../@types/MissionsRuntime';

export function missionMeshesPass(runtime: Pick<MissionsRuntime, 'pickCodes'>): ContentPass {
  return meshBodiesPassOver('mission-meshes', MISSION_CRAFT_IDS, (id) =>
    craftPickId(id, runtime.pickCodes),
  );
}
