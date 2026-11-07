/**
 * stellarStreamsFocus — what this frame's focus does to the streams, for both looks: the show
 * entry's recession for every stream, the focused one (the stream the focus pick word names,
 * latched through its fade-out) exempt.
 */

import type { FrameView } from '../../../../@types/engine/frame/FrameView';
import type { StellarStreamsFocus } from '../@types/StellarStreamsFocus';
import { unpackPick } from '../../../../data/selectionEncoding';
import { visibilityEntryOf } from '../../../../utils/visibility/visibilityEntryOf';
import { emphasisOf } from '../../../../services/engine/presentation/emphasisOf';
import { stellarStreamsVisibility } from '../../visibility';

const SHOW_ENTRY = visibilityEntryOf(stellarStreamsVisibility, 'stellarStreams');

export function stellarStreamsFocus(ctx: FrameView, pickCode: number): StellarStreamsFocus {
  const { focusPickId } = ctx.snapshot;
  const pick = focusPickId === null ? null : unpackPick(focusPickId);
  return {
    recede: emphasisOf(SHOW_ENTRY, ctx.snapshot),
    focusedStream: pick?.sourceCode === pickCode ? pick.localIdx : -1,
  };
}
