/**
 * galaxyFormatsFromSearch — the `?galaxyFormat=glade:skmp,…` boot flag as a
 * settings value. Pairs are `<source id>:<format>`; one naming no galaxy source, an
 * unknown format, or `octree` for a row that ships none is dropped, so a typo leaves the
 * default format in force instead of a blank sky.
 */

import { GALAXY_CATALOG_SOURCES, SOURCE_REGISTRY } from '../../data/sources';
import type { GalaxyCatalogFormat } from '../../@types/data/galaxyCatalog/GalaxyCatalogFormat';
import type { GalaxyCatalogSourceEntry } from '../../@types/data/galaxyCatalog/GalaxyCatalogSourceEntry';
import type { GalaxyCatalogSourceType } from '../../@types/data/galaxyCatalog/GalaxyCatalogSourceType';

export function galaxyFormatsFromSearch(
  search: string,
): Partial<Record<GalaxyCatalogSourceType, GalaxyCatalogFormat>> {
  const formats: Partial<Record<GalaxyCatalogSourceType, GalaxyCatalogFormat>> = {};
  let value: string | null;
  try {
    value = new URLSearchParams(search).get('galaxyFormat');
  } catch {
    return formats;
  }
  for (const pair of (value ?? '').split(',')) {
    const [id, format] = pair.split(':');
    const source = GALAXY_CATALOG_SOURCES.find((code) => SOURCE_REGISTRY[code].id === id);
    if (source === undefined) continue;
    const entry: GalaxyCatalogSourceEntry = SOURCE_REGISTRY[source];
    if (format === 'skmp' || (format === 'octree' && entry.octree !== undefined)) {
      formats[source] = format;
    }
  }
  return formats;
}
