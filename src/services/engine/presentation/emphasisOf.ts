/**
 * The focus emphasis one record draws at: 1 for the focused subject, else its entry's
 * recession at the frame's blend (0 = no focus, 1 = full). Recession lives here and nowhere
 * else, so the handed value stays fade × clip; a record that can never be the focus passes
 * no `pickId`. The blend's home is `structureFocusSubsystem`, never a cached copy.
 */

import type { VisibilityEntryCommon } from '../../../@types/engine/layer/VisibilityEntryCommon';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import { lerp } from '../../../utils/math/lerp';
import { STRONG_RECESSION } from '../../../data/strongRecession';
import { MILD_RECESSION } from '../../../data/mildRecession';

const RECESSION_BY_STRENGTH = { strong: STRONG_RECESSION, mild: MILD_RECESSION } as const;

export function emphasisOf(
  entry: Pick<VisibilityEntryCommon, 'recession'>,
  snapshot: Pick<ReadyFrameContext, 'focusBlend' | 'focusPickId'>,
  pickId?: number,
): number {
  if (pickId === snapshot.focusPickId || entry.recession === undefined) return 1;
  return lerp(1, RECESSION_BY_STRENGTH[entry.recession], snapshot.focusBlend);
}
