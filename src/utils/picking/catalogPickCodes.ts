/**
 * catalogPickCodes — one pick code per catalog in a Layer's `sources` rows, keyed
 * by the entry's Layer-local id (`'sdss'`, `'gaiaStars'`, …), plus the inverse.
 */

import type { CatalogPickCodes } from '../../@types/engine/selection/CatalogPickCodes';

export function catalogPickCodes<S extends number>(
  rows: readonly (readonly [S, { readonly id: string }])[],
  pickCode: (pickSourceId: string) => number,
): CatalogPickCodes<S> {
  const codeBySource = new Map<S, number>();
  const sourceByCode = new Map<number, S>();
  for (const [source, entry] of rows) {
    const code = pickCode(entry.id);
    codeBySource.set(source, code);
    sourceByCode.set(code, source);
  }
  return {
    // Total over `S`: the map holds every row.
    pickCodeOf: (source) => codeBySource.get(source)!,
    catalogOfPickCode: (code) => sourceByCode.get(code) ?? null,
  };
}
