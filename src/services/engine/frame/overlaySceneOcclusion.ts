/**
 * overlaySceneOcclusion — the one resolution of what a swap-target overlay binds at
 * group(1), read off the step alone (no rig lookup). A step that samples a mask gets the
 * mask and never `foreground:0`, which on a rig of several views holds the last view
 * only. Any other step gets the sampled-depth joint, undefined until the body pass has
 * written `foreground:0` this frame: before that its colour is stale or uninitialised and
 * would blank every caption, ring and connector.
 */

import type { OverlaySceneOcclusion } from '../../../@types/rendering/OverlaySceneOcclusion';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { SlabView } from '../../../@types/engine/frame/SlabView';
import { sampledDepthBinding } from './sampledDepthBinding';

export function overlaySceneOcclusion(
  ctx: FrameView,
  view: SlabView,
): OverlaySceneOcclusion | undefined {
  if (view.sampledMask !== undefined) {
    const maskView = view.sampledMask.view;
    return maskView === null ? undefined : { kind: 'mask', maskView };
  }
  if (!ctx.snapshot.renderedTargets.has('foreground:0')) return undefined;
  const depth = sampledDepthBinding(view.sampledDepth, ctx.bodyPose, ctx.snapshot.renderTargets);
  return {
    kind: 'sampled-depth',
    colorView: ctx.snapshot.renderTargets.viewOf('foreground:0'),
    depthView: depth.view,
    frame: depth.frame,
  };
}
