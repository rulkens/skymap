/**
 * subjectSizeFade — the fade a label's style gives its subject's apparent size: in over the
 * style's `appear` band, out as the subject fills the view. The caption (`targetAlpha`) and the
 * light-time sphere it names both call this, so they dim together at any lens. Sizes are device
 * px; the band is authored in CSS px (× `pxScale`), the fill-the-view fade is a fraction of the
 * short side or of `FILL_SPAN_RAD` at `focalPx`, whichever is smaller: the dome's short side is
 * 180°, which no subject fills. `appears: false` skips the in-band (a hovered or selected subject).
 */

import type { LabelStyleRow } from '../../@types/rendering/LabelStyleRow';
import { FILL_SPAN_RAD } from '../../data/labels/fillSpanRad';
import { smoothstep } from '../math/smoothstep';
import { overflowFade } from '../scene/overflowFade';

export function subjectSizeFade(
  style: LabelStyleRow,
  diameterPx: number,
  shortSidePx: number,
  focalPx: number,
  pxScale: number,
  appears = true,
): number {
  let alpha = 1;
  if (appears && style.appear !== undefined) {
    const { fromPx, bandPx } = style.appear;
    alpha *= smoothstep(fromPx * pxScale, (fromPx + bandPx) * pxScale, diameterPx);
  }
  return alpha * overflowFade(diameterPx, Math.min(shortSidePx, focalPx * FILL_SPAN_RAD));
}
