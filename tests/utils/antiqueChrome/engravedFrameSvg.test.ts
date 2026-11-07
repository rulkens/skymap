import { describe, expect, it } from 'vitest';
import { engravedFrameSvg } from '../../../src/utils/antiqueChrome/engravedFrameSvg';
import { engravedEdgeSvg } from '../../../src/utils/antiqueChrome/engravedEdgeSvg';
import { engravedFrameLayout } from '../../../src/utils/antiqueChrome/engravedFrameLayout';
import { svgNumber } from '../../../src/utils/antiqueChrome/svgNumber';
import { PANEL_FRAME } from '../../../src/data/ui/antiqueChrome';

const INK = '#2b2118';

/** x of every ladder cell drawn along the top band (`M<x> <bandAt>h<cell>…`). */
function topBandCells(svg: string, bandAt: number, cell: number): number[] {
  const re = new RegExp(`M([\\d.]+) ${svgNumber(bandAt).replace('.', '\\.')}h${cell}v`, 'g');
  return [...svg.matchAll(re)].map((m) => Number(m[1]));
}

describe('engravedFrameSvg', () => {
  it('inks the top band only at even cell offsets from the slice line', () => {
    const L = engravedFrameLayout(PANEL_FRAME);
    const { svg, slice } = engravedFrameSvg(PANEL_FRAME, INK, false);
    const xs = topBandCells(svg, L.bandAt, L.cell);
    expect(xs).toContain(Number(svgNumber(slice)));
    for (const x of xs) expect(Math.abs(Math.round((x - slice) / L.cell) % 2)).toBe(0);
  });

  it('opens the top edge between the corner slices, and only there', () => {
    const { svg, slice } = engravedFrameSvg(PANEL_FRAME, INK, true);
    const S = 2 * slice + 2 * PANEL_FRAME.cell;
    const C = svgNumber(slice);
    expect(svg).toContain(`M${C} 0V${C}H${svgNumber(S - slice)}V0Z`);
    expect(svg).toContain('clip-path="url(#open)"');
    expect(engravedFrameSvg(PANEL_FRAME, INK, false).svg).not.toContain('clip-path');
  });

  it('returns the layout slice and border, so the CSS slices where the SVG was drawn', () => {
    const L = engravedFrameLayout(PANEL_FRAME);
    const frame = engravedFrameSvg(PANEL_FRAME, INK, true);
    expect(frame.slice).toBe(L.slice);
    expect(frame.border).toBe(L.border);
    expect(frame.svg).toContain(`width="${svgNumber(2 * L.slice + L.tile)}"`);
  });
});

describe('engravedEdgeSvg', () => {
  it("starts on the ink cell the frame's slice line expects, then a paper cell", () => {
    const L = engravedFrameLayout(PANEL_FRAME);
    const edge = engravedEdgeSvg(PANEL_FRAME, INK);
    expect(edge.tile).toBe(L.tile);
    expect(edge.height).toBe(L.border);
    expect(edge.svg).toContain(
      `<rect x="0" y="${svgNumber(L.bandAt)}" width="${L.cell}" height="${L.band}" fill="${INK}"/>`,
    );
  });
});
