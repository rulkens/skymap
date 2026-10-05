/**
 * sampledDepthFor — what a `{ sample }` step hands its passes as
 * `SlabView.sampledDepth`: the source's depth view, plus the slab whose clear
 * `executeFrame`'s `lastDepthClear` last recorded for that target — or the
 * far-cleared placeholder and a `null` row when nothing has cleared it yet
 * (no foreground rows this frame, or a sampling step that runs before its
 * source's clearing step).
 */

import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { SampledDepth } from '../../../@types/engine/frame/SampledDepth';
import type { Slab } from '../../../@types/engine/frame/Slab';

export function sampledDepthFor(
  source: string,
  lastDepthClear: ReadonlyMap<string, Slab>,
  renderTargets: ReadyFrameContext['renderTargets'],
): SampledDepth {
  if (!lastDepthClear.has(source)) {
    return { view: renderTargets.farDepthView(), row: null };
  }
  return { view: renderTargets.depthViewOf(source), row: lastDepthClear.get(source) ?? null };
}
