import type { SlabView } from '../../../../@types/engine/frame/SlabView';
import type { StarCatalogPickRenderer } from '../../@types/StarCatalogPickRenderer';
import type { StarCutInputs } from '../../@types/StarCutInputs';
import { rebaseViewProj } from '../../../../utils/camera/rebaseViewProj';
import type { FocusUniformsValue } from '../../../../@types/rendering/FocusUniformsValue';
import { starFocusRelCam } from './starFocusRelCam';
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
  inputs: StarCutInputs,
  pxPerRad: number,
  focus: FocusUniformsValue,
): void {
  const vp = narrowMat4(rebaseViewProj(view.slab.vp, inputs.cut.originMpc));
  const focusSphere = starFocusRelCam(focus, inputs.cut.originMpc);
  for (const { source } of inputs.cut.sources) {
    pickRenderer.draw(pass, {
      source,
      vp,
      viewportPx: view.viewportPx,
      pxPerRad,
      sizePx: inputs.sizePx,
      focus: focusSphere,
    });
  }
}
