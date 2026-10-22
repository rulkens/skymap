// Data only: `appVisibility.ts` derives core's address types from this.

import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';
import { STAR_CATALOG_IDS } from '../../data/starCatalog/starCatalogIds';
import { SEEDED_STAR_CATALOGS } from '../../data/bodies/seededStarCatalogs';
import { STAR_CATALOG_SOURCE_ROWS } from './sources/starCatalogSourceRows';

// The survey Gaia bin and the S-stars draw no names. A single-parameter `.filter` is what
// lets `tsc` infer the narrowing predicate.
const LABEL_BEARING_STAR_CATALOG_IDS = STAR_CATALOG_SOURCE_ROWS.map(([, entry]) => entry)
  .filter((entry) => entry.bearsLabel)
  .map((entry) => entry.id);

export const starCatalogVisibility = [
  { key: 'sStarTrails' },
  {
    key: 'starCatalog',
    cluster: 'starCatalogs',
    items: STAR_CATALOG_IDS,
    bodies: SEEDED_STAR_CATALOGS,
  },
  {
    label: 'starCatalog',
    cluster: 'starCatalogs',
    items: LABEL_BEARING_STAR_CATALOG_IDS,
    of: 'starCatalog',
    recession: 'mild',
  },
] as const satisfies readonly VisibilityEntry[];
