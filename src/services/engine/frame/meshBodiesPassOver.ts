/**
 * meshBodiesPassOver — the lit-mesh pass over one roster: the bodies of `roster` resident on
 * the current body-m row's host. `sceneBodyPickId` packs the body's OWN table, so a moon drawn
 * as a mesh picks as a moon.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import { sceneBodyPickId } from '../../../utils/picking/sceneBodyPickId';
import { drawableMeshBodies } from './drawableMeshBodies';
import { drawMeshBodiesOnRow } from './drawMeshBodiesOnRow';
import { drawMeshBodyPicksOnRow } from './drawMeshBodyPicksOnRow';

export function meshBodiesPassOver(name: string, roster: ReadonlySet<string>): ContentPass {
  return {
    name,

    enabled(state, ctx, view) {
      if (view.slab.frame.kind !== 'body-m') return false;
      return drawableMeshBodies(state, ctx, view.slab.frame.hostId, roster).length > 0;
    },

    draw(pass, view, ctx, state) {
      if (view.slab.frame.kind !== 'body-m') return;
      const bodies = drawableMeshBodies(state, ctx, view.slab.frame.hostId, roster);
      drawMeshBodiesOnRow(pass, view, ctx, state, bodies);
    },

    drawPick(pass, view, ctx, state) {
      if (view.slab.frame.kind !== 'body-m') return;
      const bodies = drawableMeshBodies(state, ctx, view.slab.frame.hostId, roster);
      drawMeshBodyPicksOnRow(pass, view, ctx, state, bodies, sceneBodyPickId);
    },
  };
}
