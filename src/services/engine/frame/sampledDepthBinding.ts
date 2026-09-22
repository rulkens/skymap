/**
 * sampledDepthBinding — the (frame, view) pair every sampled-depth consumer
 * binds. A null frame must arrive with the far-cleared placeholder, never
 * the real view: that is what makes the shader's FAR_DEPTH arm the safety
 * net, not an assumption about who last cleared the target.
 */

import type { SampledDepth } from '../../../@types/engine/frame/SampledDepth';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { SampledDepthBinding } from '../../../@types/rendering/SampledDepthBinding';
import { sampledDepthKmFrame } from '../../../utils/camera/sampledDepthKmFrame';

export function sampledDepthBinding(
  sampledDepth: SampledDepth | undefined,
  bodyPose: ReadyFrameContext['bodyPose'],
  renderTargets: ReadyFrameContext['renderTargets'],
): SampledDepthBinding {
  if (sampledDepth === undefined) {
    return { frame: null, view: renderTargets.farDepthView() };
  }
  const frame = sampledDepthKmFrame(sampledDepth.row, bodyPose);
  return { frame, view: frame === null ? renderTargets.farDepthView() : sampledDepth.view };
}
