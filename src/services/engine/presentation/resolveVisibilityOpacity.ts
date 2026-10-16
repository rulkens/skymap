/**
 * The handed value for one identity: fade × the entry's recession × its address's clip, and
 * for a label with `of` also the `of` entry's clip, so a clip on a thing dims its label too.
 * Written once for every entry; consumers multiply nothing more in.
 */

import type { VisibilityAddress } from '../../../@types/animation/VisibilityAddress';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import { visibilityEntryOf } from '../../../utils/visibility/visibilityEntryOf';
import { recessionFactor } from './focusRecession';

export function resolveVisibilityOpacity(
  state: Pick<EngineState, 'subsystems' | 'visibilityEntries'>,
  snapshot: Pick<ReadyFrameContext, 'nowMs' | 'focusBlend'>,
  address: VisibilityAddress,
  item?: string,
): number {
  const { fades, clipPlayer } = state.subsystems;
  const { nowMs, focusBlend } = snapshot;
  const entry = visibilityEntryOf(state.visibilityEntries, address);
  const own =
    fades.opacityOf({ address, item }, nowMs) *
    recessionFactor(entry.recession, focusBlend) *
    clipPlayer.clipOpacityOf(address, nowMs);
  if (!('label' in entry) || entry.of === undefined) return own;
  return own * clipPlayer.clipOpacityOf(entry.of as VisibilityAddress, nowMs);
}
