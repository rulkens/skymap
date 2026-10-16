/**
 * The focus emphasis one record draws at: 1 for the focused subject, else its entry's
 * recession at the frame's blend. Recession lives here and nowhere else, so the handed value
 * stays fade × clip; a record that can never be the focus passes no `pickId`.
 */

import type { VisibilityEntryCommon } from '../../../@types/engine/layer/VisibilityEntryCommon';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import { recessionFactor } from './focusRecession';

export function emphasisOf(
  entry: Pick<VisibilityEntryCommon, 'recession'>,
  snapshot: Pick<ReadyFrameContext, 'focusBlend' | 'focusPickId'>,
  pickId?: number,
): number {
  return pickId === snapshot.focusPickId
    ? 1
    : recessionFactor(entry.recession, snapshot.focusBlend);
}
