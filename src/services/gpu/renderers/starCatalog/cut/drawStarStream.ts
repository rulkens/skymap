import type { SlabView } from '../../../../../@types/engine/frame/SlabView';
import type {
  StarCatalogRenderer,
  StarDrawStream,
} from '../../../../../@types/rendering/StarCatalogRenderer';
import type { PreparedStarCut } from '../../../../../@types/rendering/PreparedStarCut';
import { rebaseViewProj } from '../../../../../utils/camera/rebaseViewProj';
import { narrowMat4 } from '../../../../../utils/math/narrowMat4';
import { frustumPlanesFromViewProj } from '../../../../../utils/camera/frustumPlanesFromViewProj';
import { starCullMargins } from '../../../../../utils/star/starCullMargins';

/**
 * The 24-float destination `frustumPlanesFromViewProj` writes each frame — six
 * unit-normalized `(nx, ny, nz, d)` planes. Owned by this file alone (its
 * sibling `drawStarPick` keeps its own copy): the two used to share one
 * module-level scratch when both lived in `starCatalogPass.ts`, which was safe
 * only because they ran at disjoint times in a frame (draw, then drawPick);
 * splitting the scratch per file changes nothing about that.
 */
const frustumScratch = new Float32Array(24);

/**
 * Draw one stream of a prepared cut into the open pass: compute the rebased vp
 * once (the shared-vp invariant — every source in a frame receives the
 * IDENTICAL rebased vp, the only safe use of the renderer's one shared camera
 * uniform buffer) and issue one `renderer.draw` per source that has nodes in
 * the stream. Shared by the leaf and aggregate layers — the only difference is
 * which `StarDrawStream` (and which per-source sub-stream) each selects.
 */
export function drawStarStream(
  renderer: StarCatalogRenderer,
  pass: GPURenderPassEncoder,
  view: SlabView,
  prep: PreparedStarCut,
  stream: StarDrawStream,
  fovYRad: number,
  viewSlot: number,
): void {
  const rebasedVp = narrowMat4(rebaseViewProj(view.slab.vp, view.camPos));
  // Extract the six clip planes ONCE from the SAME rebased vp the draws use — the
  // exact matrix the GPU clips against, which is what makes the cull visually
  // lossless — and derive the leaf angular slack once. Both are source-independent
  // and forwarded identically to every source's draw (the shared-vp invariant).
  const frustumPlanes = frustumPlanesFromViewProj(rebasedVp, frustumScratch);
  const glowMarginAngleRad = starCullMargins(prep.sizePx, view.viewportPx[1], fovYRad).leaf;
  // The aggregate stream's knee normally lands in `star-upsample`, over the
  // summed half-res field. A sky-cubemap capture face (`viewSlot !== 0`) has
  // no such pass behind it — the face IS the sky the lens samples — so the
  // aggregate quads carry the knee themselves there, or captured glows read
  // brighter and more saturated than the same stars in the direct view drawn
  // beside them at the band crossfade.
  const knee = stream === 'leaf' || viewSlot !== 0;
  for (const s of prep.sources) {
    const nodes = s[stream];
    if (nodes.count === 0) continue;
    renderer.draw(pass, {
      source: s.source,
      stream,
      knee,
      vp: rebasedVp,
      viewportPx: view.viewportPx,
      drawCount: nodes.count,
      firstRecord: nodes.firstRecord,
      recordCount: nodes.recordCount,
      originRelCamMpc: nodes.originRelCamMpc,
      cellScaleMpc: nodes.cellScaleMpc,
      isAggregate: nodes.isAggregate,
      subtreeStarCount: nodes.subtreeStarCount,
      opacity: nodes.opacity,
      sizePx: prep.sizePx,
      brightness: prep.brightness,
      glowOverlap: prep.glowOverlap,
      aggregateIntensityCap: prep.aggregateIntensityCap,
      frustumPlanes,
      glowMarginAngleRad,
      viewSlot,
    });
  }
}
