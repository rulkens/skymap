/**
 * engagedTileBody — the tiling body one view engages: the first
 * `SURFACE_TILE_REGISTRY` host among the rows the view gives a body slab
 * (`visibleBodyRows`, the roster `deriveSlabs` is fed), so tiles and the drawing
 * passes never disagree about whether that body is on screen. Reads the same
 * roster, never the slab table it becomes.
 */

import type { FrameView } from '../../../../@types/engine/frame/FrameView';
import type { SceneBodyId } from '../../../../@types/scene/SceneBodyId';
import type { SurfaceTileBodyId } from '../../../../@types/data/SurfaceTileBodyId';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../../data/rendering/foregroundMaxDistance';
import { isSurfaceTileBodyId } from '../../../../utils/surfaceTiles/isSurfaceTileBodyId';
import { orbitForwardOf } from '../../../../utils/camera/orbitForwardOf';
import { visibleBodyRows } from '../visibleBodyRows';

export function engagedTileBody(ctx: FrameView): (SceneBodyId & SurfaceTileBodyId) | null {
  if (ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC) return null;
  // `ctx.cam` is the view's turned camera, so its decoded forward is exactly the
  // `viewForward` `deriveView` culled this view's rows with.
  const bodyId = visibleBodyRows(ctx.snapshot, {
    camPosMpc: ctx.drawCamPos,
    camForwardMpc: orbitForwardOf(ctx.cam),
    frustum: ctx.frustum,
    pxPerRad: ctx.drawPxPerRad,
  })
    .map((row) => row.anchorId)
    .find(isSurfaceTileBodyId);
  return bodyId ?? null;
}
