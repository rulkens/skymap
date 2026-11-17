/**
 * catalogPickCodes — one pick code per catalog in a Layer's `sources` rows, keyed
 * by the entry's id (`'sdss'`, `'gaiaStars'`, …), plus the inverse.
 */

import type { CatalogPickCodes } from '../../@types/engine/selection/CatalogPickCodes';

export function catalogPickCodes<K extends string>(
  entries: readonly { readonly id: K }[],
  pickCode: (pickSourceId: string) => number,
): CatalogPickCodes<K> {
  const codeBySource = new Map<K, number>();
  const sourceByCode = new Map<number, K>();
  for (const { id } of entries) {
    const code = pickCode(id);
    codeBySource.set(id, code);
    sourceByCode.set(code, id);
  }
  return {
    // Total over `K`: the map holds every entry.
    pickCodeOf: (key) => codeBySource.get(key)!,
    catalogOfPickCode: (code) => sourceByCode.get(code) ?? null,
  };
}
