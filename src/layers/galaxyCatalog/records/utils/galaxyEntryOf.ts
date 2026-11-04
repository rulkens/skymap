import { GALAXY_CATALOG_SOURCE_RECORD } from '../../sources/galaxyCatalogSourceRecord';
import type { GalaxyCatalogRegistryEntry } from '../../@types/GalaxyCatalogRegistryEntry';
import type { SourceType } from '../../../../@types/data/SourceType';

/** The Layer's row for `source`, or `undefined` for a source another Layer owns. */
export function galaxyEntryOf(source: SourceType): GalaxyCatalogRegistryEntry | undefined {
  return (GALAXY_CATALOG_SOURCE_RECORD as Partial<Record<SourceType, GalaxyCatalogRegistryEntry>>)[
    source
  ];
}
