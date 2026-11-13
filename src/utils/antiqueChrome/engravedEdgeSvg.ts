import type { EngravedFrameParams } from '../../@types/ui/antiqueChrome/EngravedFrameParams';
import type { EngravedEdgeTile } from '../../@types/ui/antiqueChrome/EngravedEdgeTile';
import { engravedFrameLayout } from './engravedFrameLayout';
import { svgDocument } from './svgDocument';
import { svgNumber as f } from './svgNumber';

/**
 * One tile of an engraved frame's top edge: its rules, and one ink-then-paper
 * ladder pair, so a strip repeated with `round` from the corner's slice line
 * continues the corner's chequer. `engravedFrameSvg(…, openTop)` leaves its top
 * edge to strips of this tile.
 */
export function engravedEdgeSvg(p: EngravedFrameParams, ink: string): EngravedEdgeTile {
  const L = engravedFrameLayout(p);
  let g = '';
  for (const [off, w] of L.rules) {
    g += `<rect x="0" y="${f(off - w / 2)}" width="${f(L.tile)}" height="${f(w)}" fill="${ink}"/>`;
  }
  g += `<rect x="0" y="${f(L.bandAt)}" width="${f(L.cell)}" height="${f(L.band)}" fill="${ink}"/>`;
  return { svg: svgDocument(L.tile, L.border, g), tile: L.tile, height: L.border };
}
