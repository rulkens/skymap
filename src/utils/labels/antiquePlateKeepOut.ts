/**
 * antiquePlateKeepOut — the antique plate's furniture as screen rects, for the
 * label director to keep names off: the neatline sits `ANTIQUE_NUMERAL_INSET_UNITS`
 * print units in from the canvas edge, and every sheet-anchored ornament that
 * clears the plate beneath it is placed as `placeAntiqueOrnaments` places it.
 * Tab's hidden UI withdraws them, so their corner is free. A print unit is the canvas height over `ANTIQUE_REFERENCE_HEIGHT_CSS`.
 */

import type { AntiquePlateKeepOut } from '../../@types/rendering/AntiquePlateKeepOut';
import type { ScreenRectPx } from '../../@types/rendering/ScreenRectPx';
import type { Vec2 } from '../../@types/math/Vec2';
import {
  ANTIQUE_NUMERAL_INSET_UNITS,
  ANTIQUE_REFERENCE_HEIGHT_CSS,
} from '../../data/rendering/antiqueLook';
import { ANTIQUE_ORNAMENTS } from '../../data/rendering/antiqueOrnaments';
import { ANTIQUE_ORNAMENT_ATLAS } from '../../data/rendering/antiqueOrnamentAtlas';
import { sheetAnchorCentre } from '../render/sheetAnchorCentre';

export function antiquePlateKeepOut(
  viewportPx: Readonly<Vec2>,
  chromeHidden: boolean,
): AntiquePlateKeepOut {
  const [width, height] = viewportPx;
  const unitPx = height / ANTIQUE_REFERENCE_HEIGHT_CSS;
  const inset = ANTIQUE_NUMERAL_INSET_UNITS * unitPx;
  const keepOut: ScreenRectPx[] = [];
  for (const row of ANTIQUE_ORNAMENTS) {
    const sprite = ANTIQUE_ORNAMENT_ATLAS.sprites[row.sprite];
    if (chromeHidden || row.anchor.kind !== 'sheet' || !row.clearsBeneath || sprite === undefined)
      continue;
    const [cx, cy] = sheetAnchorCentre(row.anchor, width, height, unitPx);
    const halfW = (row.anchor.sizeUnits * unitPx) / 2;
    const halfH = (halfW * sprite.h) / sprite.w;
    keepOut.push({ x0: cx - halfW, y0: cy - halfH, x1: cx + halfW, y1: cy + halfH });
  }
  return { inner: { x0: inset, y0: inset, x1: width - inset, y1: height - inset }, keepOut };
}
