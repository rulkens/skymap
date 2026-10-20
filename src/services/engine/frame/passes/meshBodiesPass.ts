/**
 * meshBodiesPass — the `meshes` branch of the per-frame body partition, as lit
 * triangle meshes in metres on their host's body-m row (`drawMeshBodiesOnRow`).
 * `sceneBodyPickId` packs the body's OWN table, so a moon drawn as a mesh picks
 * as a moon.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import { sceneBodyPickId } from '../../../../utils/picking/sceneBodyPickId';
import { bodySlabRosterIds } from '../bodySlabRosterIds';
import { drawableMeshBodies } from '../drawableMeshBodies';
import { drawMeshBodiesOnRow } from '../drawMeshBodiesOnRow';
import { drawMeshBodyPicksOnRow } from '../drawMeshBodyPicksOnRow';

export const meshBodiesPass: ContentPass = {
  name: 'mesh-bodies',

  enabled(state, ctx, view) {
    if (view.slab.frame.kind !== 'body-m') return false;
    const roster = bodySlabRosterIds(ctx.snapshot.meshBodies);
    return drawableMeshBodies(state, ctx, view.slab.frame.hostId, roster).length > 0;
  },

  draw(pass, view, ctx, state) {
    if (view.slab.frame.kind !== 'body-m') return;
    const roster = bodySlabRosterIds(ctx.snapshot.meshBodies);
    const bodies = drawableMeshBodies(state, ctx, view.slab.frame.hostId, roster);
    drawMeshBodiesOnRow(pass, view, ctx, state, bodies);
  },

  drawPick(pass, view, ctx, state) {
    if (view.slab.frame.kind !== 'body-m') return;
    const roster = bodySlabRosterIds(ctx.snapshot.meshBodies);
    const bodies = drawableMeshBodies(state, ctx, view.slab.frame.hostId, roster);
    drawMeshBodyPicksOnRow(pass, view, ctx, state, bodies, sceneBodyPickId);
  },
};
