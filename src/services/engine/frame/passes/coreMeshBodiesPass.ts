/**
 * coreMeshBodiesPass — the `meshes` branch of core's body partition (Søndermarken, the
 * shape-model moons), as lit triangle meshes on their host's body-m row
 * (`drawMeshBodiesOnRow`). Runs after `mission-meshes` on the same step, so a row still
 * draws the craft first. `sceneBodyPickId` packs the body's OWN table, so a moon drawn as
 * a mesh picks as a moon.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import { sceneBodyPickId } from '../../../../utils/picking/sceneBodyPickId';
import { coreSceneBodyIds } from '../coreSceneBodyIds';
import { drawableMeshBodies } from '../drawableMeshBodies';
import { drawMeshBodiesOnRow } from '../drawMeshBodiesOnRow';
import { drawMeshBodyPicksOnRow } from '../drawMeshBodyPicksOnRow';

export const coreMeshBodiesPass: ContentPass = {
  name: 'core-mesh-bodies',

  enabled(state, ctx, view) {
    if (view.slab.frame.kind !== 'body-m') return false;
    const roster = coreSceneBodyIds(ctx.snapshot.meshBodies);
    return drawableMeshBodies(state, ctx, view.slab.frame.hostId, roster).length > 0;
  },

  draw(pass, view, ctx, state) {
    if (view.slab.frame.kind !== 'body-m') return;
    const roster = coreSceneBodyIds(ctx.snapshot.meshBodies);
    const bodies = drawableMeshBodies(state, ctx, view.slab.frame.hostId, roster);
    drawMeshBodiesOnRow(pass, view, ctx, state, bodies);
  },

  drawPick(pass, view, ctx, state) {
    if (view.slab.frame.kind !== 'body-m') return;
    const roster = coreSceneBodyIds(ctx.snapshot.meshBodies);
    const bodies = drawableMeshBodies(state, ctx, view.slab.frame.hostId, roster);
    drawMeshBodyPicksOnRow(pass, view, ctx, state, bodies, sceneBodyPickId);
  },
};
