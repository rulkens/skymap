/**
 * makeGalaxyCatalogItems — `settings.galaxyCatalogs.items` for engine fixtures,
 * keyed off `GALAXY_CATALOG_SOURCES`. Consumers read `items[id].enabled`
 * for every one of them, so a hand-listed record dies on the first missing id.
 * `of` returns the per-row deviations from an all-on baseline.
 */

import { GALAXY_CATALOG_SOURCES } from '../../src/layers/galaxyCatalog/sources/galaxyCatalogSources';
import { galaxyCatalogIdOf } from '../../src/utils/galaxyCatalogIdOf';

import type { GalaxyCatalogId } from '../../src/layers/galaxyCatalog/@types/GalaxyCatalogId';
import type { GalaxyCatalogItemSettings } from '../../src/layers/galaxyCatalog/@types/GalaxyCatalogItemSettings';

export function makeGalaxyCatalogItems(
  of: (id: GalaxyCatalogId) => Partial<GalaxyCatalogItemSettings> = () => ({}),
): Record<GalaxyCatalogId, GalaxyCatalogItemSettings> {
  return Object.fromEntries(
    GALAXY_CATALOG_SOURCES.map((source) => {
      const id = galaxyCatalogIdOf(source);
      return [id, { enabled: true, labelEnabled: true, ...of(id) }];
    }),
  ) as Record<GalaxyCatalogId, GalaxyCatalogItemSettings>;
}
