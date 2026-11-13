/**
 * selectedAsteroidRows — catalog rows of the focused then selected asteroid, deduped and inside the
 * catalog. Focus comes first: the camera follows it, so its dot is the one that needs the f64 place.
 * Hover is left out: a pointer sweep crosses many dots.
 */
import type { SelectionState } from '../../../../@types/store/SelectionState';
import type { AsteroidCatalog } from '../../catalog/@types/AsteroidCatalog';
import type { AsteroidRef } from '../@types/AsteroidRef';
import { isKind } from '../../../../utils/selection/isKind';

export function selectedAsteroidRows(
  { select, focus }: SelectionState,
  catalog: AsteroidCatalog,
): number[] {
  const ks: number[] = [];
  for (const ref of [focus, select]) {
    if (!isKind<AsteroidRef>(ref, 'asteroid')) continue;
    const k = ref.number - 1;
    if (k >= 0 && k < catalog.count && !ks.includes(k)) ks.push(k);
  }
  return ks;
}
