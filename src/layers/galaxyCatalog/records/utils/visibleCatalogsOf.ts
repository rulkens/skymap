/**
 * visibleCatalogsOf — the set of galaxy catalog ids of the sources core hands a value above 0.
 *
 * Pure and computed on read, never cached: a stored set would need a writer to
 * remember to refresh it. The handed value carries the switch and its fade-out tail, so
 * a just-hidden catalog stays in the set while it fades instead of popping.
 */

import type { GalaxyCatalogId } from '../../@types/GalaxyCatalogId';
import { GALAXY_CATALOG_SOURCES } from '../../sources/galaxyCatalogSources';
import { galaxyCatalogIdOf } from '../../../../utils/galaxyCatalogIdOf';

export function visibleCatalogsOf(
  fade: Readonly<Record<GalaxyCatalogId, number>>,
): ReadonlySet<GalaxyCatalogId> {
  const visible = new Set<GalaxyCatalogId>();
  for (const src of GALAXY_CATALOG_SOURCES) {
    const id = galaxyCatalogIdOf(src);
    if (fade[id] > 0) visible.add(id);
  }
  return visible;
}
