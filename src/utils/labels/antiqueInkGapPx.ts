/**
 * antiqueInkGapPx — how far above its subject's centre an engraved name's ink
 * bottom sits, px: just off the glyph's rim. The lift stage places a name by it and
 * the declutter judges the name there, so the two can't disagree.
 */

import { ANTIQUE_LABEL_STYLE } from '../../data/labels/antiqueLabelStyle';

export function antiqueInkGapPx(subjectSizePx: number, devicePixelRatio: number): number {
  return (
    subjectSizePx * ANTIQUE_LABEL_STYLE.rimFraction + ANTIQUE_LABEL_STYLE.gapPx * devicePixelRatio
  );
}
