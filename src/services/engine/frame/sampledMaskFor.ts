/**
 * sampledMaskFor — what a `mask: { sample }` step hands its passes as
 * `SlabView.sampledMask`: the source row's view, or `null` unless a step wrote that row
 * THIS frame. `rendered` is the frame-wide set (`executeFrame`), right for a mask the
 * whole frame builds once and every later step reads.
 */

import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { SampledMask } from '../../../@types/engine/frame/SampledMask';

export function sampledMaskFor(
  source: string,
  rendered: ReadonlySet<string>,
  renderTargets: ReadyFrameContext['renderTargets'],
): SampledMask {
  return { view: rendered.has(source) ? renderTargets.viewOf(source) : null };
}
