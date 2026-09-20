import type { FrameView } from '../../../../../@types/engine/frame/FrameView';
import type { SlabView } from '../../../../../@types/engine/frame/SlabView';
import type { StarCatalogRenderer } from '../../../../../@types/rendering/starCatalogRenderer/StarCatalogRenderer';
import type { PreparedStarCut } from '../../../../../@types/rendering/PreparedStarCut';
import { rebaseViewProj } from '../../../../../utils/camera/rebaseViewProj';
import { narrowMat4 } from '../../../../../utils/math/narrowMat4';
import { frustumPlanesFromViewProj } from '../../../../../utils/camera/frustumPlanesFromViewProj';
import { starCullMargins } from '../../../../../utils/star/starCullMargins';
import type { StarDrawStream } from '../../../../../@types/rendering/starCatalogRenderer/StarDrawStream';

/**
 * Six unit-normalized `(nx, ny, nz, d)` clip planes, rewritten each frame.
 * Owned by this file alone — `drawStarPick` keeps its own copy, safe because
 * the two run at disjoint times in a frame (draw, then pick).
 */
const frustumScratch = new Float32Array(24);

/**
 * Draw one stream of a prepared cut: compute the rebased vp once — the
 * SHARED-VP INVARIANT, every source in a frame must get the IDENTICAL
 * rebased vp, the only safe use of the renderer's one shared camera uniform
 * buffer that every draw call in the loop below rewrites — then issue one
 * `renderer.draw` per source with nodes in the stream. Shared by the leaf and
 * aggregate layers; only the selected `StarDrawStream` differs.
 */
export function drawStarStream(
  renderer: StarCatalogRenderer,
  pass: GPURenderPassEncoder,
  view: SlabView,
  prep: PreparedStarCut,
  stream: StarDrawStream,
  ctx: FrameView,
): void {
  // About the CUT's origin, not this view's eye: a rig view whose eye differs
  // from the one the cut was baked about still lands every node where it is.
  const rebasedVp = narrowMat4(rebaseViewProj(view.slab.vp, prep.originMpc));
  // Same rebased vp the GPU clips against, so the CPU cull is visually
  // lossless; source-independent, forwarded identically to every draw.
  const frustumPlanes = frustumPlanesFromViewProj(rebasedVp, frustumScratch);
  const glowMarginAngleRad = starCullMargins(prep.sizePx, view.viewportPx[1], ctx.fovYRad).leaf;
  // This view's own pixels per radian: `drawPxPerRad` holds for the view's own
  // size, and a target spanning the same frustum in fewer rows (the aggregate
  // stream's half-res offscreen) scales with its height.
  const pxPerRad = ctx.drawPxPerRad * (view.viewportPx[1] / ctx.canvasSize.height);
  // A sky-cubemap capture face has no `star-upsample` pass behind it to carry
  // the aggregate knee, so the aggregate quads knee themselves here instead —
  // else a captured glow reads brighter/more saturated than the same star in
  // the direct view beside it.
  const knee = stream === 'leaf' || ctx.viewKind === 'capture';
  for (const s of prep.sources) {
    const nodes = s[stream];
    if (nodes.count === 0) continue;
    renderer.draw(pass, {
      source: s.source,
      stream,
      knee,
      vp: rebasedVp,
      viewportPx: view.viewportPx,
      pxPerRad,
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
      viewSlot: ctx.viewSlot,
    });
  }
}
