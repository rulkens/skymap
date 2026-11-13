/**
 * antiquePlateKeepOut — where names may not print on the antique plate, as
 * screen rects for the label director: the neatline sits `ANTIQUE_NUMERAL_INSET_UNITS`
 * print units in from the canvas edge; the open UI panels (`covers`, device px)
 * are kept clear, and so is the title cartouche (`cartouche`, its box as
 * `antiquePlateCartouche` placed it). Tab's hidden UI withdraws both, so their
 * corner is free. A print unit is the canvas height over `ANTIQUE_REFERENCE_HEIGHT_CSS`.
 */

import type { AntiquePlateKeepOut } from '../../@types/rendering/AntiquePlateKeepOut';
import type { ScreenRectPx } from '../../@types/rendering/ScreenRectPx';
import type { Vec2 } from '../../@types/math/Vec2';
import {
  ANTIQUE_NUMERAL_INSET_UNITS,
  ANTIQUE_REFERENCE_HEIGHT_CSS,
} from '../../data/rendering/antiqueLook';

export function antiquePlateKeepOut(
  viewportPx: Readonly<Vec2>,
  chromeHidden: boolean,
  covers: readonly ScreenRectPx[],
  cartouche: ScreenRectPx,
): AntiquePlateKeepOut {
  const [width, height] = viewportPx;
  const inset = ANTIQUE_NUMERAL_INSET_UNITS * (height / ANTIQUE_REFERENCE_HEIGHT_CSS);
  return {
    inner: { x0: inset, y0: inset, x1: width - inset, y1: height - inset },
    keepOut: chromeHidden ? [] : [...covers, cartouche],
  };
}
