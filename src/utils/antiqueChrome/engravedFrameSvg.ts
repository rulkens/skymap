import type { EngravedFrameParams } from '../../@types/ui/antiqueChrome/EngravedFrameParams';
import type { SliceImage } from '../../@types/ui/antiqueChrome/SliceImage';
import { acanthusCornerSvg } from './acanthusCornerSvg';
import { engravedFrameLayout } from './engravedFrameLayout';
import { svgDocument } from './svgDocument';
import { svgNumber as f } from './svgNumber';

const ORNAMENT_BOX = 40;
const HATCH_PITCH_PX = 1.9;

/**
 * The 9-slice source for an engraved compartment: the smallest square holding
 * four corner slices and one edge tile. `openTop` leaves the top edge between the
 * corners blank, for a title cartouche that sits astride the top rule: the
 * flanking rule strips come from `engravedEdgeSvg`, so the gap is always exactly
 * the cartouche's width.
 */
export function engravedFrameSvg(p: EngravedFrameParams, ink: string, openTop: boolean): SliceImage {
  const L = engravedFrameLayout(p);
  const C = L.slice;
  const S = 2 * C + L.tile;
  let g = '';
  for (const [off, w] of L.rules) {
    g += `<rect x="${f(off)}" y="${f(off)}" width="${f(S - 2 * off)}" height="${f(S - 2 * off)}" fill="none" stroke="${ink}" stroke-width="${f(w)}"/>`;
  }
  const be = L.bandAt + L.band;
  let d = '';
  // Ink cells sit at even offsets from the slice line (k = 0 at x = C), on all four sides.
  for (let x = be; x < S - be - 0.01; x += L.cell) {
    if (Math.round((x - C) / L.cell) % 2 !== 0) continue;
    const a = f(L.bandAt);
    const b = f(S - be);
    d += `M${f(x)} ${a}h${L.cell}v${L.band}h${-L.cell}ZM${f(x)} ${b}h${L.cell}v${L.band}h${-L.cell}Z`;
    d += `M${a} ${f(x)}v${L.cell}h${L.band}v${-L.cell}ZM${b} ${f(x)}v${L.cell}h${L.band}v${-L.cell}Z`;
  }
  const blocks: readonly (readonly [number, number])[] = [
    [L.bandAt, L.bandAt],
    [S - be, L.bandAt],
    [L.bandAt, S - be],
    [S - be, S - be],
  ];
  for (const [x, y] of blocks) {
    d += `M${f(x)} ${f(y)}h${L.band}v${L.band}h${-L.band}Z`;
  }
  g += `<path d="${d}" fill="${ink}"/>`;

  let defs = '';
  if (p.ornament > 0) {
    const k = p.ornament / ORNAMENT_BOX;
    const pitch = f(HATCH_PITCH_PX / k);
    defs =
      `<pattern id="hatch" width="${pitch}" height="${pitch}" patternUnits="userSpaceOnUse" patternTransform="rotate(-38)">` +
      `<line x1="0" y1="0" x2="0" y2="${pitch}" stroke="${ink}" stroke-width="${f((HATCH_PITCH_PX / k) * 0.32)}"/></pattern>`;
    const art = `<g transform="scale(${f(k)})">${acanthusCornerSvg(ink, 0.85 / k)}</g>`;
    const a = L.border + 1;
    const corners: readonly (readonly [number, number, number, number])[] = [
      [a, a, 1, 1],
      [S - a, a, -1, 1],
      [a, S - a, 1, -1],
      [S - a, S - a, -1, -1],
    ];
    for (const [x, y, sx, sy] of corners) {
      g += `<g transform="translate(${f(x)} ${f(y)}) scale(${sx} ${sy})">${art}</g>`;
    }
  }
  if (openTop) {
    const hole = `M0 0H${f(S)}V${f(S)}H0ZM${f(C)} 0V${f(C)}H${f(S - C)}V0Z`;
    defs += `<clipPath id="open"><path clip-rule="evenodd" d="${hole}"/></clipPath>`;
    g = `<g clip-path="url(#open)">${g}</g>`;
  }
  return { svg: svgDocument(S, S, `<defs>${defs}</defs>${g}`), slice: C, border: L.border };
}
