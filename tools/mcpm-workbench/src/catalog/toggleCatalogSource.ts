import type { GalaxyCatalogId } from '../../../../src/layers/galaxyCatalog/@types/GalaxyCatalogId';
import { WORKBENCH_SOURCES } from './workbenchSources.constant';

// Pure array helper, not a slice reducer — it transforms a `sources` array in
// isolation (no `CatalogSlice` in or out), so it stays a plain function the
// UI composes with `setCatalogSources` rather than a case reducer.
export function toggleCatalogSource(
  current: readonly GalaxyCatalogId[],
  s: GalaxyCatalogId,
  on: boolean,
): readonly GalaxyCatalogId[] {
  const enabled = new Set(current);
  if (on) enabled.add(s);
  else enabled.delete(s);
  return WORKBENCH_SOURCES.filter((source) => enabled.has(source));
}
