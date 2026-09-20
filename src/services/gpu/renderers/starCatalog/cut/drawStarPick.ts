import type { SlabView } from '../../../../../@types/engine/frame/SlabView';
import type { StarCatalogPickRenderer } from '../../../../../@types/rendering/StarCatalogPickRenderer';
import type { PreparedStarCut } from '../../../../../@types/rendering/PreparedStarCut';
import { rebaseViewProj } from '../../../../../utils/camera/rebaseViewProj';
import { narrowMat4 } from '../../../../../utils/math/narrowMat4';
import { frustumPlanesFromViewProj } from '../../../../../utils/camera/frustumPlanesFromViewProj';
import { starCullMargins } from '../../../../../utils/star/starCullMargins';
import { starPickLeafDraws } from './starPickLeafDraws';

/**
 * The 24-float clip-plane destination, owned by this file alone — see
 * `drawStarStream`'s identical scratch for why splitting the old shared
 * `starCatalogPass.ts` scratch in two is behaviour-identical: this and
 * `drawStarStream` run at disjoint times in a frame (visual draw, then pick).
 */
const frustumScratch = new Float32Array(24);

/**
 * Stamp every visible LEAF star's packed identity into the NEAR0 r32uint pick
 * pass — via `pickRenderer` and the leaf-only, visible-only `starPickLeafDraws`
 * filter — so a hover/click over a resolved star yields a Field-star selection.
 * AGGREGATE glows are never pickable: a flux mip that stands in for a whole
 * subtree has no single star to name.
 *
 * The rebased vp is computed ONCE before the per-source loop — the same
 * shared-vp discipline `drawStarStream` follows (every source in a frame
 * receives the identical `narrowMat4(rebaseViewProj(...))` matrix; the pick
 * renderer's camera uniform is one shared buffer, safe only under that
 * invariant). The margin uses the PICK branch of `starCullMargins`: every leaf
 * is floored to the 3.5 px clickable footprint, so the cull sphere must cover
 * that inflated dot (a false cull here = an unclickable edge star, forbidden),
 * which the visual 1.5 px slack would undercover.
 */
export function drawStarPick(
  pickRenderer: StarCatalogPickRenderer,
  pass: GPURenderPassEncoder,
  view: SlabView,
  fovYRad: number,
  prep: PreparedStarCut,
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
