/**
 * catalogPickCodes — one pick code per catalog in a Layer's `sources` rows, keyed
 * by the entry's Layer-local id (`'sdss'`, `'gaiaStars'`, …), plus the inverse. The key is a
 * `Source` value, or a structure category id.
 */

import type { CatalogPickCodes } from '../../@types/engine/selection/CatalogPickCodes';

export function catalogPickCodes<K extends string | number>(
  rows: readonly (readonly [K, { readonly id: string }])[],
  pickCode: (pickSourceId: string) => number,
): CatalogPickCodes<K> {
  const codeBySource = new Map<K, number>();
  const sourceByCode = new Map<number, K>();
  for (const [key, entry] of rows) {
    const code = pickCode(entry.id);
    codeBySource.set(key, code);
    sourceByCode.set(code, key);
  }
  return {
    // Total over `K`: the map holds every row.
    pickCodeOf: (key) => codeBySource.get(key)!,
    catalogOfPickCode: (code) => sourceByCode.get(code) ?? null,
  };
}
