/**
 * engagedTileBody — the tiling body one view engages on the live path
 * (`planSurfaceCut`): the first of `tileBodiesInView`, registry order.
 * `planSurfaceTiles` keys on `SurfaceTileOver` instead and P8b deletes this.
 */

import type { FrameView } from '../../../../@types/engine/frame/FrameView';
import type { SceneBodyId } from '../../../../@types/scene/SceneBodyId';
import type { SurfaceTileBodyId } from '../../../../@types/data/SurfaceTileBodyId';
import { tileBodiesInView } from './tileBodiesInView';

export function engagedTileBody(ctx: FrameView): (SceneBodyId & SurfaceTileBodyId) | null {
  return tileBodiesInView(ctx)[0] ?? null;
}
