/**
 * sheetAnchorCentre — where a sheet-anchored ornament's centre falls on a
 * canvas, in device px: its print-unit inset measured inward from its corner.
 * The one placement the ornament pass and the label keep-out both read.
 */

import type { AntiqueOrnamentAnchor } from '../../@types/rendering/AntiqueOrnamentAnchor';
import type { Vec2 } from '../../@types/math/Vec2';

export function sheetAnchorCentre(
  anchor: Extract<AntiqueOrnamentAnchor, { kind: 'sheet' }>,
  width: number,
  height: number,
  unitPx: number,
): Vec2 {
  const [ix, iy] = anchor.insetUnits;
  const left = anchor.corner === 'topLeft' || anchor.corner === 'bottomLeft';
  const top = anchor.corner === 'topLeft' || anchor.corner === 'topRight';
  return [left ? ix * unitPx : width - ix * unitPx, top ? iy * unitPx : height - iy * unitPx];
}
