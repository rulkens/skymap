import type { SliceImage } from '../../@types/ui/antiqueChrome/SliceImage';
import { svgDocument } from './svgDocument';
import { svgNumber as f } from './svgNumber';

const SIZE = 14;
const SLICE = 6;

const incurved = (x0: number, y0: number, x1: number, y1: number, r: number): string =>
  `M${f(x0 + r)} ${f(y0)}H${f(x1 - r)}A${r} ${r} 0 0 0 ${f(x1)} ${f(y0 + r)}V${f(y1 - r)}` +
  `A${r} ${r} 0 0 0 ${f(x1 - r)} ${f(y1)}H${f(x0 + r)}A${r} ${r} 0 0 0 ${f(x0)} ${f(y1 - r)}` +
  `V${f(y0 + r)}A${r} ${r} 0 0 0 ${f(x0 + r)} ${f(y0)}Z`;

/**
 * The small-cartouche tablet for buttons: an incurved-corner outline (concave
 * quarter circles) with a fine inner rule, on an opaque `ground`. 9-slice at
 * `slice` with `fill`, so the corners stay whole at any button size.
 */
export function tabletSvg(ink: string, ground: string): SliceImage {
  const outer = incurved(0.6, 0.6, SIZE - 0.6, SIZE - 0.6, 3.2);
  const inner = incurved(2.7, 2.7, SIZE - 2.7, SIZE - 2.7, 2);
  const svg = svgDocument(
    SIZE,
    SIZE,
    `<path d="${outer}" fill="${ground}" stroke="${ink}" stroke-width="1"/><path d="${inner}" fill="none" stroke="${ink}" stroke-width=".45"/>`,
  );
  return { svg, slice: SLICE, border: SLICE };
}
