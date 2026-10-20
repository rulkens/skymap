/**
 * sourceMaskOf — the galaxy catalog bitmask of the sources core hands a value above 0.
 *
 * Pure and computed on read, never cached: a stored mask would need a writer to
 * remember to refresh it. The handed value carries the switch and its fade-out tail, so
 * a just-hidden catalog stays in the mask while it fades instead of popping.
 */

import type { GalaxyCatalogId } from '../../../@types/data/galaxyCatalog/GalaxyCatalogId';
import { GALAXY_CATALOG_SOURCES } from '../../../data/sources';
import { galaxyCatalogIdOf } from '../../../utils/galaxyCatalogIdOf';
import { maskWith } from '../../../utils/maskWith';

export function sourceMaskOf(fade: Readonly<Record<GalaxyCatalogId, number>>): number {
  let mask = 0;
  for (const src of GALAXY_CATALOG_SOURCES) {
    // `src ∈ GALAXY_CATALOG_SOURCES` ⇒ its registry id is a galaxy catalog id;
    // `galaxyCatalogIdOf` contains the narrowing cast that the broad `SourceId`
    // typing on `.id` would otherwise force here.
    if (fade[galaxyCatalogIdOf(src)] > 0) mask = maskWith(mask, src);
  }
  return mask;
}
