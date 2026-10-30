/**
 * galaxyFormatsFromSearch — the `?galaxyFormat=glade:skmp,…` boot flag as a
 * settings value. Pairs are `<source id>:<format>`; one naming no galaxy source, an
 * unknown format, or `octree` for a row that ships none is dropped, so a typo leaves the
 * default format in force instead of a blank sky.
 */

import { APP_SOURCE_REGISTRY } from '../../compositions/appSources';
import type { GalaxyCatalogFormat } from '../../@types/data/galaxyCatalog/GalaxyCatalogFormat';
import type { GalaxyCatalogSourceEntry } from '../../@types/data/galaxyCatalog/GalaxyCatalogSourceEntry';
import type { GalaxyCatalogRegistryEntry } from '../../@types/data/galaxyCatalog/GalaxyCatalogRegistryEntry';
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
    const row = Object.values(APP_SOURCE_REGISTRY).find(
      (e): e is GalaxyCatalogRegistryEntry => e.type === 'galaxyCatalog' && e.id === id,
    );
    if (row === undefined) continue;
    const entry: GalaxyCatalogSourceEntry = row;
    if (format === 'skmp' || (format === 'octree' && entry.octree !== undefined)) {
      formats[row.code] = format;
    }
  }
  return formats;
}
