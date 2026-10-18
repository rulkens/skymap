import type { FadeValueOf } from '../../../@types/animation/FadeValueOf';
import type { VisibilityAddress } from '../../../@types/animation/VisibilityAddress';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import { visibilityEntryOf } from '../../../utils/visibility/visibilityEntryOf';
import { resolveVisibilityOpacity } from './resolveVisibilityOpacity';

/** An address's handed value in its entry's shape: one number, or one per item. The cast is
 * sound because `FadeValueOf` derives its shape from the same entry's `items`. */
export function resolveFadeValue<A extends VisibilityAddress>(
  state: Pick<EngineState, 'subsystems' | 'visibilityEntries'>,
  snapshot: Pick<ReadyFrameContext, 'nowMs'>,
  address: A,
): FadeValueOf<A> {
  const { items } = visibilityEntryOf(state.visibilityEntries, address);
  if (items === undefined) {
    return resolveVisibilityOpacity(state, snapshot, address) as FadeValueOf<A>;
  }
  return Object.fromEntries(
    items.map((item) => [item, resolveVisibilityOpacity(state, snapshot, address, item)]),
  ) as FadeValueOf<A>;
}
