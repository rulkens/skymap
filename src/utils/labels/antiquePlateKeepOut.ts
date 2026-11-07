/**
 * antiquePlateKeepOut — where names may not print on the antique plate, as
 * screen rects for the label director: the neatline sits `ANTIQUE_NUMERAL_INSET_UNITS`
 * print units in from the canvas edge; the open UI panels (`covers`, device px)
 * are kept clear; and every sheet-anchored ornament that clears the plate beneath
 * it is placed as `placeAntiqueOrnaments` places it, clear of those panels.
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
import { antiqueSheetAnchor } from '../gpu/antiqueLook/antiqueSheetAnchor';

export function antiquePlateKeepOut(
  viewportPx: Readonly<Vec2>,
  chromeHidden: boolean,
  covers: readonly ScreenRectPx[],
): AntiquePlateKeepOut {
  const [width, height] = viewportPx;
  const unitPx = height / ANTIQUE_REFERENCE_HEIGHT_CSS;
  const inset = ANTIQUE_NUMERAL_INSET_UNITS * unitPx;
  const keepOut: ScreenRectPx[] = chromeHidden ? [] : [...covers];
  for (const row of ANTIQUE_ORNAMENTS) {
    const sprite = ANTIQUE_ORNAMENT_ATLAS.sprites[row.sprite];
    if (chromeHidden || row.anchor.kind !== 'sheet' || !row.clearsBeneath || sprite === undefined)
      continue;
    const anchor = antiqueSheetAnchor(row.anchor, sprite.h / sprite.w, viewportPx, unitPx, covers);
    const [cx, cy] = sheetAnchorCentre(anchor, width, height, unitPx);
    const halfW = (anchor.sizeUnits * unitPx) / 2;
    const halfH = (halfW * sprite.h) / sprite.w;
    keepOut.push({ x0: cx - halfW, y0: cy - halfH, x1: cx + halfW, y1: cy + halfH });
  }
  return { inner: { x0: inset, y0: inset, x1: width - inset, y1: height - inset }, keepOut };
}
