/**
 * stellarStreamsFocus — what this frame's focus does to the streams, for both looks: the show
 * entry's recession for every stream, the focused one (the stream the focus pick word names,
 * latched through its fade-out) exempt and brightened by its meta's boost as the focus blends in.
 */

import type { FrameView } from '../../../../@types/engine/frame/FrameView';
import type { StellarStreamMeta } from '../../catalog/@types/StellarStreamMeta';
import type { StellarStreamsFocus } from '../@types/StellarStreamsFocus';
import { unpackPick } from '../../../../data/selectionEncoding';
import { lerp } from '../../../../utils/math/lerp';
import { visibilityEntryOf } from '../../../../utils/visibility/visibilityEntryOf';
import { emphasisOf } from '../../../../services/engine/presentation/emphasisOf';
import { stellarStreamsVisibility } from '../../visibility';

const SHOW_ENTRY = visibilityEntryOf(stellarStreamsVisibility, 'stellarStreams');

export function stellarStreamsFocus(
  ctx: FrameView,
  pickCode: number,
  meta: readonly StellarStreamMeta[] | null,
): StellarStreamsFocus {
  const { focusPickId, focusBlend } = ctx.snapshot;
  const pick = focusPickId === null ? null : unpackPick(focusPickId);
  const focusedStream = pick?.sourceCode === pickCode ? pick.localIdx : -1;
  const boost = meta?.[focusedStream]?.focusBoost ?? 1;
  return {
    recede: emphasisOf(SHOW_ENTRY, ctx.snapshot),
    focusedStream,
    focusBoost: lerp(1, boost, focusBlend),
  };
}
