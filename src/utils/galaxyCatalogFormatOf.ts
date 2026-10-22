/**
 * galaxyCatalogFormatOf — the format a galaxy source streams in: the setting when
 * there is one, else the octree when the row ships one, else the flat files.
 */

import { SOURCE_REGISTRY } from '../data/sources';
import type { GalaxyCatalogFormat } from '../@types/data/galaxyCatalog/GalaxyCatalogFormat';
import type { GalaxyCatalogSourceEntry } from '../@types/data/galaxyCatalog/GalaxyCatalogSourceEntry';
import type { GalaxyCatalogSourceType } from '../@types/data/galaxyCatalog/GalaxyCatalogSourceType';

export function galaxyCatalogFormatOf(
  formats: Partial<Record<GalaxyCatalogSourceType, GalaxyCatalogFormat>>,
  source: GalaxyCatalogSourceType,
): GalaxyCatalogFormat {
  const entry: GalaxyCatalogSourceEntry = SOURCE_REGISTRY[source];
  return formats[source] ?? (entry.octree !== undefined ? 'octree' : 'skmp');
}
