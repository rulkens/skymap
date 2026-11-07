import type { EngravedFrameLayout } from '../../@types/ui/antiqueChrome/EngravedFrameLayout';
import type { EngravedFrameParams } from '../../@types/ui/antiqueChrome/EngravedFrameParams';

/**
 * Lays out an engraved frame from the outside in. The corner slice is grown to a
 * whole number of ladder cells past the band's end, so the edge tile starts on an
 * ink cell exactly at the slice line and `round` repetition never breaks the
 * ink/paper alternation where an edge meets a corner.
 */
export function engravedFrameLayout(p: EngravedFrameParams): EngravedFrameLayout {
  const rules: (readonly [number, number])[] = [[p.outer / 2, p.outer]];
  let o = p.outer + p.gap;
  rules.push([o + p.hair / 2, p.hair]);
  o += p.hair;
  const bandAt = o;
  o += p.band;
  rules.push([o + p.hair / 2, p.hair]);
  o += p.hair;
  const border = o;
  // The ornament sits 1 px inside the rules; a plain corner still clears them by 2 px.
  const need = border + (p.ornament > 0 ? p.ornament + 1 : 2);
  const bandEnd = bandAt + p.band;
  const slice = bandEnd + p.cell * Math.max(1, Math.ceil((need - bandEnd) / p.cell));
  return { rules, bandAt, band: p.band, cell: p.cell, border, slice, tile: 2 * p.cell };
}
