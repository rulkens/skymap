/**
 * tileBodiesInView — the `SURFACE_TILE_REGISTRY` hosts among the rows one view
 * gives a body slab (`visibleBodyRows`, the roster `deriveSlabs` is fed), so
 * tiles and the drawing passes never disagree about whether a body is on
 * screen. Reads the same roster, never the slab table it becomes.
 */

import type { FrameView } from '../../../../@types/engine/frame/FrameView';
import type { SceneBodyId } from '../../../../@types/scene/SceneBodyId';
import type { SurfaceTileBodyId } from '../../../../@types/data/SurfaceTileBodyId';
import { isSurfaceTileBodyId } from './isSurfaceTileBodyId';
import { orbitForwardOf } from '../../../../utils/camera/orbitForwardOf';
import { visibleBodyRows } from '../../../../services/engine/frame/visibleBodyRows';

export function tileBodiesInView(ctx: FrameView): readonly (SceneBodyId & SurfaceTileBodyId)[] {
  // `ctx.cam` is the view's turned camera, so its decoded forward is exactly the
  // `viewForward` `deriveView` culled this view's rows with.
  return visibleBodyRows(ctx.snapshot, {
    camPosMpc: ctx.drawCamPos,
    camForwardMpc: orbitForwardOf(ctx.cam),
    frustum: ctx.frustum,
    pxPerRad: ctx.drawPxPerRad,
  })
    .map((row) => row.anchorId)
    .filter(isSurfaceTileBodyId);
}
