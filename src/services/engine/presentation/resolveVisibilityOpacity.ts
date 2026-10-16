/**
 * The handed value for one identity: fade × its address's clip, and for a label with `of`
 * also the `of` entry's clip, so a clip on a thing dims its label too. Written once for every
 * entry. It never recedes: recession depends on which record is the focus, so it is
 * `emphasisOf`'s, composed per record.
 */

import type { VisibilityAddress } from '../../../@types/animation/VisibilityAddress';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import { visibilityEntryOf } from '../../../utils/visibility/visibilityEntryOf';

export function resolveVisibilityOpacity(
  state: Pick<EngineState, 'subsystems' | 'visibilityEntries'>,
  snapshot: Pick<ReadyFrameContext, 'nowMs'>,
  address: VisibilityAddress,
  item?: string,
): number {
  const { fades, clipPlayer } = state.subsystems;
  const { nowMs } = snapshot;
  const entry = visibilityEntryOf(state.visibilityEntries, address);
  const own = fades.opacityOf({ address, item }, nowMs) * clipPlayer.clipOpacityOf(address, nowMs);
  if (!('label' in entry) || entry.of === undefined) return own;
  return own * clipPlayer.clipOpacityOf(entry.of as VisibilityAddress, nowMs);
}
