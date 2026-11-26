/**
 * sampledDepthOcclusion — `overlaySceneOcclusion` for a consumer that speaks only the
 * sampled-depth joint (the selection rings, the occlusion-mask pass): on a step that
 * samples a mask instead it gets nothing, and draws unoccluded.
 */

import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { SlabView } from '../../../@types/engine/frame/SlabView';
import type { SampledDepthSceneOcclusion } from '../../../@types/rendering/SampledDepthSceneOcclusion';
import { overlaySceneOcclusion } from './overlaySceneOcclusion';

export function sampledDepthOcclusion(
  ctx: FrameView,
  view: SlabView,
): SampledDepthSceneOcclusion | undefined {
  const scene = overlaySceneOcclusion(ctx, view);
  return scene?.kind === 'sampled-depth' ? scene : undefined;
}
