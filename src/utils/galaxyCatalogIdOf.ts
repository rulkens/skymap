/**
 * galaxyCatalogIdOf — a galaxy-catalog `Source` code's string `GalaxyCatalogId`,
 * read off the Layer's own record so the id keeps its literal type.
 */

import type { GalaxyCatalogSourceType } from '../layers/galaxyCatalog/@types/GalaxyCatalogSourceType';
import type { GalaxyCatalogId } from '../layers/galaxyCatalog/@types/GalaxyCatalogId';
import { GALAXY_CATALOG_SOURCE_RECORD } from '../layers/galaxyCatalog/sources/galaxyCatalogSourceRecord';

export function galaxyCatalogIdOf(source: GalaxyCatalogSourceType): GalaxyCatalogId {
  return GALAXY_CATALOG_SOURCE_RECORD[source].id;
}
