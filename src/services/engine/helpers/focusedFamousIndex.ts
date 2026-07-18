import { Source } from '../../../data/sources';
import type { SelectionRef } from '../../../@types/engine/SelectionRef';

/**
 * focusedFamousIndex — a ref's famous-catalog row index, or null for nothing /
 * a structure / the Milky Way / a galaxy from any other catalog.
 *
 * The famous-label producer's `focusedOnly` gate wants "row index if a famous
 * galaxy is focused, else null" — the positional twin of `structureIdOf`.
 * Famous refs are positional (`index` into the famous catalog), and the
 * meta ⋈ catalog label join is index-aligned, so the row index IS the label
 * identity.
 */
export function focusedFamousIndex(ref: SelectionRef | null): number | null {
  return ref !== null && ref.type === 'galaxyCatalog' && ref.source === Source.FamousGalaxy
    ? ref.index
    : null;
}
