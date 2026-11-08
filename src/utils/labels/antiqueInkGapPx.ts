/**
 * antiqueInkGapPx — how far above its subject's centre an engraved name's ink
 * bottom sits, device px: just off the glyph's rim, unless the lift names its own gap
 * (a title's). The lift stage places a name by it and the declutter judges the name
 * there, so the two can't disagree.
 */

import type { Label2DLift } from '../../@types/rendering/Label2DLift';
import { ANTIQUE_LABEL_STYLE } from '../../data/labels/antiqueLabelStyle';

export function antiqueInkGapPx(lift: Label2DLift, devicePixelRatio: number): number {
  return (
    lift.inkGapPx ??
    lift.subjectSizePx * ANTIQUE_LABEL_STYLE.rimFraction +
      ANTIQUE_LABEL_STYLE.gapPx * devicePixelRatio
  );
}
