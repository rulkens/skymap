/**
 * subjectSizeFade — the fade a label's style gives its subject's apparent size: in over the
 * style's `appear` band, out as the subject fills the view. The caption (`targetAlpha`) and the light-time sphere it names both call this, so they
 * dim together at any lens. `appears: false` skips the in-band (a hovered or selected subject).
 */

import type { LabelStyleRow } from '../../@types/rendering/LabelStyleRow';
import { smoothstep } from '../math/smoothstep';
import { overflowFade } from '../scene/overflowFade';

export function subjectSizeFade(
  style: LabelStyleRow,
  diameterPx: number,
  shortSidePx: number,
  appears = true,
): number {
  let alpha = 1;
  if (appears && style.appear !== undefined) {
    const { fromPx, bandPx } = style.appear;
    alpha *= smoothstep(fromPx, fromPx + bandPx, diameterPx);
  }
  return alpha * overflowFade(diameterPx, shortSidePx);
}
