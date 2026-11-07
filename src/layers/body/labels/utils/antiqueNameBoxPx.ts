/**
 * antiqueNameBoxPx — the box a place name takes once `antiqueLabel` sets it, estimated
 * from its cut's mean advance (`ANTIQUE_LABEL_STYLE`) so a producer can fit it before
 * the atlas lays it out. Tracking falls between letters only; `lineEm` is the line
 * pitch a `\n` adds.
 */

import type { Size } from '../../../../@types/rendering/Size';
import type { AntiqueLettering } from '../../../../@types/rendering/AntiqueLettering';
import { ANTIQUE_LABEL_STYLE } from '../../../../data/labels/antiqueLabelStyle';

export function antiqueNameBoxPx(
  name: string,
  cut: AntiqueLettering,
  trackingEm: number,
  px: number,
  lineEm: number,
): Size {
  const lines = name.split('\n');
  const { advanceEm } = ANTIQUE_LABEL_STYLE[cut];
  const width = Math.max(
    ...lines.map((line) => line.length * advanceEm + Math.max(line.length - 1, 0) * trackingEm),
  );
  return { width: width * px, height: px * (1 + (lines.length - 1) * lineEm) };
}
