/**
 * sampledMaskFor — a `mask: { sample }` step's `SlabView.sampledMask`: `null` unless a
 * step wrote the source row THIS frame. `rendered` is frame-wide: right for a mask the
 * frame builds once, wrong for a per-view row.
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
