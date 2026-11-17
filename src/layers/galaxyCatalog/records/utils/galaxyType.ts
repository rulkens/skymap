/**
 * Catalog-aware galaxy type: each catalog carries different photometric bands, so one set of
 * colour thresholds would mis-classify non-SDSS rows. Each entry's `typeColour` names its
 * slots and thresholds.
 */

import { GALAXY_CATALOG_SOURCE_RECORD } from '../../sources/galaxyCatalogSourceRecord';
import { GALAXY_TYPE_CLASSIFIERS } from '../data/galaxyTypeClassifiers';
import type { GalaxyTypeInfo } from '../@types/GalaxyTypeInfo';
import type { GalaxyTypeMags } from '../@types/GalaxyTypeMags';
import type { GalaxyCatalogId } from '../../@types/GalaxyCatalogId';

// 'green' (intermediate) rather than a special unknown state, so the card keeps a neutral swatch.
const UNKNOWN: GalaxyTypeInfo = { category: 'green', description: 'Unknown galaxy type' };

export function galaxyType(source: GalaxyCatalogId, mags: GalaxyTypeMags): GalaxyTypeInfo {
  const { slotA, slotB, thresholds } = GALAXY_CATALOG_SOURCE_RECORD[source].typeColour;
  const slots = { u: mags.magU, g: mags.magG, r: mags.magR, i: mags.magI, z: mags.magZ };
  const index = slots[slotA] - slots[slotB];
  return Number.isFinite(index) ? GALAXY_TYPE_CLASSIFIERS[thresholds](index) : UNKNOWN;
}
