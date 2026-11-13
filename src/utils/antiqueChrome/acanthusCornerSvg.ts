import { svgNumber as f } from './svgNumber';

const LEAF_PAIRS = 4;
const LEAF_LENGTH = 25;

/**
 * The acanthus corner piece (late-17th-c. Amsterdam cartouches): a diagonal leaf
 * with a scrolled stem along each rule. Drawn in a 40-unit box with the frame's
 * inner corner at the origin; the caller scales and mirrors it into each corner.
 * `stroke` is the line weight in box units, so lines stay fine at any size.
 * Fills reference `url(#hatch)`, which the caller defines.
 */
export function acanthusCornerSvg(ink: string, stroke: number): string {
  const along = (t: number, off: number): string =>
    `${f(2 + t * LEAF_LENGTH + off * Math.SQRT1_2)} ${f(2 + t * LEAF_LENGTH - off * Math.SQRT1_2)}`;
  const side = (sgn: number): string => {
    let d = 'M2 2';
    for (let i = 0; i < LEAF_PAIRS; i++) {
      const t0 = i / LEAF_PAIRS;
      const t1 = (i + 1) / LEAF_PAIRS;
      const w = sgn * 7.5 * Math.sin(Math.PI * ((t0 + t1) / 2) * 0.85 + 0.3);
      d += `C${along(t0 + 0.15 / LEAF_PAIRS, w * 1.35)} ${along(t1 + 0.05 / LEAF_PAIRS, w * 1.15)} ${along(t1, w * 0.3)}`;
    }
    return `${d}L${2 + LEAF_LENGTH} ${2 + LEAF_LENGTH}`;
  };
  const leaf = side(1);
  const stem = 'M3 1.6C14 .6 26 1.6 32 7.6C36 12.6 31 17.6 27 14.6C24 12.6 26 8.6 29 10.1';
  const leaflet = 'M12 1.3c2-1.8 5-1.4 6 .6c-2 .6-4.5 .4-6-.6z';
  const half = `<path d="${stem}" fill="none" stroke-linecap="round"/><path d="${leaflet}" fill="url(#hatch)"/>`;
  const vein = f(2 + LEAF_LENGTH * 0.85);
  return (
    `<g stroke="${ink}" stroke-width="${f(stroke)}" fill="none" stroke-linejoin="round">` +
    `${half}<g transform="matrix(0 1 1 0 0 0)">${half}</g>` +
    `<path d="${leaf}Z" fill="url(#hatch)" stroke="none"/><path d="${leaf}"/><path d="${side(-1)}"/>` +
    `<path d="M2 2L${vein} ${vein}" stroke-width="${f(stroke * 0.7)}"/></g>`
  );
}
