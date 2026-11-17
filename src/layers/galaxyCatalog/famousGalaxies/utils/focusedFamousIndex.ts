import type { SelectionRefBase } from '../../../../@types/engine/selection/SelectionRefBase';
import { isKind } from '../../../../utils/selection/isKind';
import type { GalaxyCatalogRef } from '../../selection/@types/GalaxyCatalogRef';

/**
 * focusedFamousIndex — a ref's famous-catalog row index, or null for nothing /
 * a structure / the Milky Way / a galaxy from any other catalog.
 *
 * The famous-label producer's `focusedOnly` gate wants "row index if a famous
 * galaxy is focused, else null" — the positional twin of `structureIdOf`.
 * Famous refs are positional (`index` into the famous catalog), and the
 * compiled-in name table is index-aligned with the catalog, so the row index IS
 * the label identity.
 */
export function focusedFamousIndex(ref: SelectionRefBase | null): number | null {
  return isKind<GalaxyCatalogRef>(ref, 'galaxyCatalog') && ref.source === 'famousGalaxy'
    ? ref.index
    : null;
}
