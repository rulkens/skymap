/**
 * missionMeshesPass — the craft as lit meshes on their host's body-m row, through core's one
 * mesh handle (`state.gpu.meshBodyRenderer`; the slots stay core's). Runs before
 * `core-mesh-bodies` on the same step, so a row still draws the craft first.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import { sceneBodyPickId } from '../../../utils/picking/sceneBodyPickId';
import { drawableMeshBodies } from '../../../services/engine/frame/drawableMeshBodies';
import { drawMeshBodiesOnRow } from '../../../services/engine/frame/drawMeshBodiesOnRow';
import { drawMeshBodyPicksOnRow } from '../../../services/engine/frame/drawMeshBodyPicksOnRow';
import { MISSION_CRAFT_IDS } from '../present/missionCraftIds';

export const missionMeshesPass: ContentPass = {
  name: 'mission-meshes',

  enabled(state, ctx, view) {
    if (view.slab.frame.kind !== 'body-m') return false;
    return drawableMeshBodies(state, ctx, view.slab.frame.hostId, MISSION_CRAFT_IDS).length > 0;
  },

  draw(pass, view, ctx, state) {
    if (view.slab.frame.kind !== 'body-m') return;
    const bodies = drawableMeshBodies(state, ctx, view.slab.frame.hostId, MISSION_CRAFT_IDS);
    drawMeshBodiesOnRow(pass, view, ctx, state, bodies);
  },

  drawPick(pass, view, ctx, state) {
    if (view.slab.frame.kind !== 'body-m') return;
    const bodies = drawableMeshBodies(state, ctx, view.slab.frame.hostId, MISSION_CRAFT_IDS);
    drawMeshBodyPicksOnRow(pass, view, ctx, state, bodies, sceneBodyPickId);
  },
};
