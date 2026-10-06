import type { SlabView } from '../../../../@types/engine/frame/SlabView';
import type { StarCatalogPickRenderer } from '../../@types/StarCatalogPickRenderer';
import type { StarCutFrame } from '../../@types/StarCutFrame';
import { rebaseViewProj } from '../../../../utils/camera/rebaseViewProj';
import { narrowMat4 } from '../../../../utils/math/narrowMat4';

/**
 * Stamp every drawn LEAF star's packed identity into the NEAR0 r32uint pick
 * pass, from the lists the last frame's GPU cut left — so a hover/click names
 * exactly a star that frame drew. Rebased about the CUT's origin, as
 * `drawStarCut` does: the pick must land node for node on the visual draw.
 */
export function drawStarPick(
  pickRenderer: StarCatalogPickRenderer,
  pass: GPURenderPassEncoder,
  view: SlabView,
  frame: StarCutFrame,
  pxPerRad: number,
): void {
  const vp = narrowMat4(rebaseViewProj(view.slab.vp, frame.originMpc));
  for (const { source } of frame.sources) {
    pickRenderer.draw(pass, {
      source,
      vp,
      viewportPx: view.viewportPx,
      pxPerRad,
      sizePx: frame.sizePx,
    });
  }
}
