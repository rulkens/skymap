/**
 * missionMeshesPass — the craft as lit meshes on their host's body-m row, through core's one
 * mesh handle (`state.gpu.meshBodyRenderer`; the slots stay core's).
 */

import { meshBodiesPassOver } from '../../../services/engine/frame/meshBodiesPassOver';
import { MISSION_CRAFT_IDS } from '../present/missionCraftIds';

export const missionMeshesPass = meshBodiesPassOver('mission-meshes', MISSION_CRAFT_IDS);
