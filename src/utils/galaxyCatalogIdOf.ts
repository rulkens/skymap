/**
 * galaxyCatalogIdOf — resolve a numeric galaxy-catalog `Source` code to
 * its string `GalaxyCatalogId`.
 *
 * The registry types every entry's `.id` as the broad `SourceId` (which
 * spans structures, filaments, and volumes too), so a caller holding a
 * galaxy-catalog source code can't get a `GalaxyCatalogId` back without a
 * narrowing cast. That cast is sound only when the source is known to be a
 * galaxy catalog — so it lives here, in one place, rather than scattered
 * `as GalaxyCatalogId` assertions at every fade-id construction site. The
 * caller's obligation is simply "pass a galaxy-catalog source code"; the
 * unsafe step is named and contained.
 */

import type { SourceType } from '../@types/data/SourceType';
import type { GalaxyCatalogId } from '../@types/data/galaxyCatalog/GalaxyCatalogId';
import { SOURCE_REGISTRY } from '../data/sources';

export function galaxyCatalogIdOf(source: SourceType): GalaxyCatalogId {
  return SOURCE_REGISTRY[source].id as GalaxyCatalogId;
}
