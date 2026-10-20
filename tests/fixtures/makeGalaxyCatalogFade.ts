/**
 * makeGalaxyCatalogFade — the `Record<GalaxyCatalogId, number>` core hands the
 * `survey` entry's consumers, every catalog at `rest` unless `overrides` says
 * otherwise. Keyed off `GALAXY_CATALOG_SOURCES` so a new catalog never leaves a
 * hand-listed record short.
 */

import { GALAXY_CATALOG_SOURCES } from '../../src/data/sources';
import { galaxyCatalogIdOf } from '../../src/utils/galaxyCatalogIdOf';

import type { GalaxyCatalogId } from '../../src/@types/data/galaxyCatalog/GalaxyCatalogId';

export function makeGalaxyCatalogFade(
  overrides: Partial<Record<GalaxyCatalogId, number>> = {},
  rest = 1,
): Record<GalaxyCatalogId, number> {
  return Object.fromEntries(
    GALAXY_CATALOG_SOURCES.map((source) => {
      const id = galaxyCatalogIdOf(source);
      return [id, overrides[id] ?? rest];
    }),
  ) as Record<GalaxyCatalogId, number>;
}
