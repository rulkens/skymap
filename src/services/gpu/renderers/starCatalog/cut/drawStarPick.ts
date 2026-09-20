import type { SlabView } from '../../../../../@types/engine/frame/SlabView';
import type { StarCatalogPickRenderer } from '../../../../../@types/rendering/starCatalogPickRenderer/StarCatalogPickRenderer';
import type { PreparedStarCut } from '../../../../../@types/rendering/PreparedStarCut';
import { rebaseViewProj } from '../../../../../utils/camera/rebaseViewProj';
import { narrowMat4 } from '../../../../../utils/math/narrowMat4';
import { frustumPlanesFromViewProj } from '../../../../../utils/camera/frustumPlanesFromViewProj';
import { starCullMargins } from '../../../../../utils/star/starCullMargins';
import { starPickLeafDraws } from './starPickLeafDraws';

/** Owned by this file alone; see `drawStarStream`'s identical scratch. */
const frustumScratch = new Float32Array(24);

/**
 * Stamp every visible LEAF star's packed identity into the NEAR0 r32uint pick
 * pass, so a hover/click over a resolved star yields a Field-star selection.
 * AGGREGATE glows are never pickable — a flux mip standing in for a whole
 * subtree has no single star to name. Follows `drawStarStream`'s shared-vp
 * discipline and the pick floor of `starCullMargins` (see `buildStarCutFrustum`
 * for the pick-slack rationale).
 */
export function drawStarPick(
  pickRenderer: StarCatalogPickRenderer,
  pass: GPURenderPassEncoder,
  view: SlabView,
  prep: PreparedStarCut,
  fovYRad: number,
): void {
  const rebasedVp = narrowMat4(rebaseViewProj(view.slab.vp, view.camPos));
  const frustumPlanes = frustumPlanesFromViewProj(rebasedVp, frustumScratch);
  const glowMarginAngleRad = starCullMargins(prep.sizePx, view.viewportPx[1], fovYRad).pick;
  for (const d of starPickLeafDraws(prep)) {
    pickRenderer.draw(pass, {
      source: d.source,
      vp: rebasedVp,
      viewportPx: view.viewportPx,
      drawCount: d.drawCount,
      firstRecord: d.firstRecord,
      recordCount: d.recordCount,
      originRelCamMpc: d.originRelCamMpc,
      cellScaleMpc: d.cellScaleMpc,
      sizePx: prep.sizePx,
      frustumPlanes,
      glowMarginAngleRad,
    });
  }
}
