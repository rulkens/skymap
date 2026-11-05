/**
 * galaxyPickCodes — one pick code per galaxy catalog, keyed by the catalog's
 * Layer-local id (`'sdss'`, `'famousGalaxy'`, …), plus the inverse lookup.
 */

import { GALAXY_CATALOG_SOURCES } from '../../sources/galaxyCatalogSources';
import { GALAXY_CATALOG_SOURCE_RECORD } from '../../sources/galaxyCatalogSourceRecord';
import type { GalaxyCatalogSourceType } from '../../@types/GalaxyCatalogSourceType';
import type { GalaxyPickCodes } from '../@types/GalaxyPickCodes';

export function galaxyPickCodes(pickCode: (pickSourceId: string) => number): GalaxyPickCodes {
  const codeBySource = new Map<GalaxyCatalogSourceType, number>();
  const sourceByCode = new Map<number, GalaxyCatalogSourceType>();
  for (const source of GALAXY_CATALOG_SOURCES) {
    const code = pickCode(GALAXY_CATALOG_SOURCE_RECORD[source].id);
    codeBySource.set(source, code);
    sourceByCode.set(code, source);
  }
  return {
    // Total: the map holds every member of the closed catalog union.
    pickCodeOf: (source) => codeBySource.get(source)!,
    catalogOfPickCode: (code) => sourceByCode.get(code) ?? null,
  };
}
