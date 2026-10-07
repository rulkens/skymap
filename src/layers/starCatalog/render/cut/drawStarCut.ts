import type { FrameView } from '../../../../@types/engine/frame/FrameView';
import type { SlabView } from '../../../../@types/engine/frame/SlabView';
import type { StarCatalogRenderer } from '../../@types/StarCatalogRenderer';
import type { StarDrawStream } from '../../@types/StarDrawStream';
import { rebaseViewProj } from '../../../../utils/camera/rebaseViewProj';
import { narrowMat4 } from '../../../../utils/math/narrowMat4';

/**
 * Draw one stream of the frame's GPU cut into a view. A sky-cubemap face
 * shares the frame's eye and scalars but reads the capture cut (every
 * direction, no fade), and knees its own aggregates: no `star-upsample` pass
 * follows a face to carry the knee, so a captured glow would otherwise read
 * brighter than the same star in the direct view beside it.
 */
export function drawStarCut(
  renderer: StarCatalogRenderer,
  pass: GPURenderPassEncoder,
  view: SlabView,
  ctx: FrameView,
  stream: StarDrawStream,
): void {
  const frame = renderer.getFrameCut();
  if (frame === null) return;
  const capture = ctx.viewKind === 'capture';
  // About the CUT's origin, not this view's eye: identical for every source,
  // the only safe use of the renderer's one camera uniform per view slot.
  const vp = narrowMat4(rebaseViewProj(view.slab.vp, frame.originMpc));
  // This view's own pixels per radian, scaled to a target spanning the same
  // frustum in fewer rows (the aggregate stream's half-res offscreen).
  const pxPerRad = ctx.drawPxPerRad * (view.viewportPx[1] / ctx.canvasSize.height);
  for (const { source } of frame.sources) {
    renderer.drawCut(pass, {
      source,
      stream,
      capture,
      knee: stream === 'leaf' || capture,
      vp,
      viewportPx: view.viewportPx,
      pxPerRad,
      sizePx: frame.sizePx,
      brightness: frame.brightness,
      glowOverlap: frame.glowOverlap,
      aggregateIntensityCap: frame.aggregateIntensityCap,
      viewSlot: ctx.viewSlot,
    });
  }
}
