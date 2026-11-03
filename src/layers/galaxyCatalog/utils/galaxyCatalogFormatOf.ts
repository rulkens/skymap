/**
 * galaxyCatalogFormatOf — the format a galaxy source streams in: the setting when
 * there is one, else the octree when the row ships one, else the flat files.
 */

import { GALAXY_CATALOG_SOURCE_RECORD } from '../sources/galaxyCatalogSourceRecord';
import type { GalaxyCatalogFormat } from '../../../@types/data/galaxyCatalog/GalaxyCatalogFormat';
import type { GalaxyCatalogSourceEntry } from '../../../@types/data/galaxyCatalog/GalaxyCatalogSourceEntry';
import type { GalaxyCatalogSourceType } from '../@types/GalaxyCatalogSourceType';

export function galaxyCatalogFormatOf(
  formats: Partial<Record<GalaxyCatalogSourceType, GalaxyCatalogFormat>>,
  source: GalaxyCatalogSourceType,
): GalaxyCatalogFormat {
  const entry: GalaxyCatalogSourceEntry = GALAXY_CATALOG_SOURCE_RECORD[source];
  return formats[source] ?? (entry.octree !== undefined ? 'octree' : 'skmp');
}
