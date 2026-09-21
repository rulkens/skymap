/**
 * overlaySceneOcclusion — the one resolution of what a swap-target overlay
 * binds at group(1). Undefined until the body pass has written `foreground:0`
 * this frame: before that its colour is stale or uninitialised and would blank
 * every caption, ring and connector.
 */

import type { OverlaySceneOcclusion } from '../../../@types/rendering/OverlaySceneOcclusion';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { SlabView } from '../../../@types/engine/frame/SlabView';
import { sampledDepthKmFrame } from '../../../utils/camera/sampledDepthKmFrame';

export function overlaySceneOcclusion(
  ctx: ReadyFrameContext,
  view: SlabView,
): OverlaySceneOcclusion | undefined {
  if (!ctx.renderedTargets.has('foreground:0')) return undefined;
  const sampledDepth = view.sampledDepth;
  const frame =
    sampledDepth === undefined ? null : sampledDepthKmFrame(sampledDepth.row, ctx.bodyPose);
  return {
    colorView: ctx.renderTargets.viewOf('foreground:0'),
    // An unresolved frame must arrive with the far placeholder, never the real
    // view — that is what makes the shader's FAR_DEPTH early-out, not an
    // assumption about who last cleared the target, the thing keeping it safe.
    depthView: frame === null ? ctx.renderTargets.farDepthView() : sampledDepth!.view,
    frame,
  };
}
