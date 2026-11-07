import type { HexString } from '../../@types/math/HexString';
import type { PaperParams } from '../../@types/ui/antiqueChrome/PaperParams';
import type { SliceImage } from '../../@types/ui/antiqueChrome/SliceImage';
import { paperNoiseFilter } from './paperNoiseFilter';
import { svgDocument } from './svgDocument';
import { svgNumber as f } from './svgNumber';

const SLICE = 6;
/** The middle `round` repeats: wide enough that its paper grain never reads as a pattern. */
const SIZE = 2 * SLICE + 40;

const incurved = (x0: number, y0: number, x1: number, y1: number, r: number): string =>
  `M${f(x0 + r)} ${f(y0)}H${f(x1 - r)}A${r} ${r} 0 0 0 ${f(x1)} ${f(y0 + r)}V${f(y1 - r)}` +
  `A${r} ${r} 0 0 0 ${f(x1 - r)} ${f(y1)}H${f(x0 + r)}A${r} ${r} 0 0 0 ${f(x0)} ${f(y1 - r)}` +
  `V${f(y0 + r)}A${r} ${r} 0 0 0 ${f(x0 + r)} ${f(y0)}Z`;

/**
 * The small-cartouche tablet for buttons: an incurved-corner outline (concave
 * quarter circles) with a fine inner rule, on an opaque `ground` with the panels'
 * paper grain. 9-slice at `slice` with `fill` and `round`, so the corners stay whole
 * at any button size. A `wash` (a pigment, at `strength`) is laid by hand: multiplied
 * over the grain, past the inner rule, pooled darker at its edge.
 */
export function tabletSvg(
  ink: string,
  ground: HexString,
  paper: PaperParams,
  wash?: { pigment: string; strength: number },
): SliceImage {
  const outer = incurved(0.6, 0.6, SIZE - 0.6, SIZE - 0.6, 3.2);
  const inner = incurved(2.7, 2.7, SIZE - 2.7, SIZE - 2.7, 2);
  const laid = incurved(1.8, 1.9, SIZE - 1.9, SIZE - 1.7, 2.6);
  const grain = paperNoiseFilter(
    'g',
    f(paper.grain),
    5,
    SIZE,
    ground,
    paper.tone,
    paper.grainStrength,
    false,
  );
  // Multiplying a pigment-white blend at `strength` is the wash multiplyWashHex bakes on plain
  // paper; the filter lets its edge wander and its pigment settle unevenly around that mean.
  const brush =
    `<filter id="w" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">` +
    `<feTurbulence type="fractalNoise" baseFrequency=".09" numOctaves="2" seed="3"/>` +
    `<feDisplacementMap in="SourceGraphic" scale="2.4" xChannelSelector="R" yChannelSelector="G" result="d"/>` +
    `<feTurbulence type="fractalNoise" baseFrequency=".06" numOctaves="2" seed="4"/>` +
    `<feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1.8 0 0 0 .1"/>` +
    `<feComposite in="d" operator="in"/></filter>`;
  const washed = wash
    ? `<path d="${laid}" fill="${wash.pigment}" fill-opacity="${f(wash.strength)}" stroke="${wash.pigment}" stroke-opacity="${f(Math.min(1, wash.strength * 1.7))}" stroke-width=".8" filter="url(#w)" style="mix-blend-mode:multiply"/>`
    : '';
  const svg = svgDocument(
    SIZE,
    SIZE,
    `<defs>${grain}${wash ? brush : ''}<clipPath id="c"><path d="${outer}"/></clipPath></defs>` +
      `<path d="${outer}" fill="${ground}"/><rect width="${SIZE}" height="${SIZE}" filter="url(#g)" clip-path="url(#c)"/>${washed}` +
      `<path d="${outer}" fill="none" stroke="${ink}" stroke-width="1"/><path d="${inner}" fill="none" stroke="${ink}" stroke-width=".45"/>`,
  );
  return { svg, slice: SLICE, border: SLICE };
}
