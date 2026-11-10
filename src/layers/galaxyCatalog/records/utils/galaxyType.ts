/**
 * Catalog-aware galaxy type: each catalog carries different photometric bands, so one set of
 * colour thresholds would mis-classify non-SDSS rows. `COLOUR_INDEX_BY_CATALOG` names the
 * bands and the classifier per catalog.
 */

import { COLOUR_INDEX_BY_CATALOG } from '../data/colourIndexByCatalog';
import type { GalaxyTypeInfo } from '../@types/GalaxyTypeInfo';
import type { GalaxyTypeMags } from '../@types/GalaxyTypeMags';
import type { GalaxyCatalogSourceType } from '../../@types/GalaxyCatalogSourceType';

// 'green' (intermediate) rather than a special unknown state, so the card keeps a neutral swatch.
const UNKNOWN: GalaxyTypeInfo = { category: 'green', description: 'Unknown galaxy type' };

export function galaxyType(source: GalaxyCatalogSourceType, mags: GalaxyTypeMags): GalaxyTypeInfo {
  const { bluer, redder, classify } = COLOUR_INDEX_BY_CATALOG[source];
  const index = mags[bluer] - mags[redder];
  return Number.isFinite(index) ? classify(index) : UNKNOWN;
}
