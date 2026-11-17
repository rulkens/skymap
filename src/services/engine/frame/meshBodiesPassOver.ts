/**
 * meshBodiesPassOver — the lit-mesh pass over one roster: the bodies of `roster` resident on
 * the current body-m row's host. `pickIdOf` packs the roster owner's OWN table (core's
 * `sceneBodyPickId`, so a moon drawn as a mesh picks as a moon; missions' `craftPickId`).
 * `materialOf` restyles the whole roster each frame; absent, every mesh renders as baked.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import { drawableMeshBodies } from './drawableMeshBodies';
import { drawMeshBodiesOnRow } from './drawMeshBodiesOnRow';
import { drawMeshBodyPicksOnRow } from './drawMeshBodyPicksOnRow';
import type { SceneBodyId } from '../../../@types/scene/SceneBodyId';
import type { PassState } from '../../../@types/engine/frame/PassState';
import type { MeshMaterialFactors } from '../../../@types/rendering/MeshMaterialFactors';

export function meshBodiesPassOver(
  name: string,
  roster: ReadonlySet<string>,
  pickIdOf: (bodyId: SceneBodyId) => number | null,
  materialOf?: (state: PassState) => MeshMaterialFactors,
): ContentPass {
  return {
    name,

    enabled(state, ctx, view) {
      if (view.slab.frame.kind !== 'body-m') return false;
      return drawableMeshBodies(state, ctx, view.slab.frame.hostId, roster).length > 0;
    },

    draw(pass, view, ctx, state) {
      if (view.slab.frame.kind !== 'body-m') return;
      const bodies = drawableMeshBodies(state, ctx, view.slab.frame.hostId, roster);
      drawMeshBodiesOnRow(pass, view, ctx, state, bodies, materialOf?.(state));
    },

    drawPick(pass, view, ctx, state) {
      if (view.slab.frame.kind !== 'body-m') return;
      const bodies = drawableMeshBodies(state, ctx, view.slab.frame.hostId, roster);
      drawMeshBodyPicksOnRow(pass, view, ctx, state, bodies, pickIdOf);
    },
  };
}
