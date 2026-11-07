/**
 * antiqueExtract<AntiqueOrnamentAnchor, { kind: 'sheet' }> — where a sheet ornament (the title cartouche) goes this
 * frame, clear of the open UI panels (`covers`, device px): its authored corner
 * if free, else the first free corner (top left, top right, bottom left, bottom
 * right), else the same order at smaller sizes, its corner-side edges held at
 * the authored margins. With no free place at all it keeps the authored one,
 * shrunk: under a panel rather than over the subject at the plate's centre.
 */

import type { AntiqueOrnamentAnchor } from '../../../@types/rendering/AntiqueOrnamentAnchor';
import type { ScreenRectPx } from '../../../@types/rendering/ScreenRectPx';
import type { Vec2 } from '../../../@types/math/Vec2';
import { sheetAnchorCentre } from '../../render/sheetAnchorCentre';

const CORNERS: readonly Extract<AntiqueOrnamentAnchor, { kind: 'sheet' }>['corner'][] = [
  'topLeft',
  'topRight',
  'bottomLeft',
  'bottomRight',
];
const SCALES = [1, 0.8, 0.65, 0.55] as const;
/** Room kept between the ornament and a panel, print units. */
const GAP_UNITS = 14;

export function antiqueSheetAnchor(
  anchor: Extract<AntiqueOrnamentAnchor, { kind: 'sheet' }>,
  /** The sprite's height over its width. */
  aspect: number,
  size: Readonly<Vec2>,
  unitPx: number,
  covers: readonly ScreenRectPx[],
): Extract<AntiqueOrnamentAnchor, { kind: 'sheet' }> {
  const [width, height] = size;
  const margin: Vec2 = [
    anchor.insetUnits[0] - anchor.sizeUnits / 2,
    anchor.insetUnits[1] - (anchor.sizeUnits * aspect) / 2,
  ];
  const order = [anchor.corner, ...CORNERS.filter((c) => c !== anchor.corner)];
  for (const scale of SCALES) {
    for (const corner of order) {
      const sizeUnits = anchor.sizeUnits * scale;
      const candidate: Extract<AntiqueOrnamentAnchor, { kind: 'sheet' }> = {
        kind: 'sheet',
        corner,
        sizeUnits,
        insetUnits: [margin[0] + sizeUnits / 2, margin[1] + (sizeUnits * aspect) / 2],
      };
      const [cx, cy] = sheetAnchorCentre(candidate, width, height, unitPx);
      const hw = (sizeUnits / 2 + GAP_UNITS) * unitPx;
      const hh = ((sizeUnits * aspect) / 2 + GAP_UNITS) * unitPx;
      const free = !covers.some(
        (c) => cx - hw < c.x1 && cx + hw > c.x0 && cy - hh < c.y1 && cy + hh > c.y0,
      );
      if (free) return scale === 1 && corner === anchor.corner ? anchor : candidate;
    }
  }
  const sizeUnits = anchor.sizeUnits * SCALES[SCALES.length - 1]!;
  return {
    ...anchor,
    sizeUnits,
    insetUnits: [margin[0] + sizeUnits / 2, margin[1] + (sizeUnits * aspect) / 2],
  };
}
