/** What the Layer can show and label, as data. Imports data only: `appVisibility.ts` derives
 * core's address types from it, and a Layer-typed import would make that a circular alias. */

import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';
import { STAR_CATALOG_IDS } from '../../data/starCatalog/starCatalogIds';
import { STAR_CATALOG_SOURCE_ROWS } from './sources/starCatalogSourceRows';

// The survey Gaia bin and the S-stars draw no names. A single-parameter `.filter` is what
// lets `tsc` infer the narrowing predicate.
const LABEL_BEARING_STAR_CATALOG_IDS = STAR_CATALOG_SOURCE_ROWS.map(([, entry]) => entry)
  .filter((entry) => entry.bearsLabel)
  .map((entry) => entry.id);

export const starCatalogVisibility = [
  { key: 'starCatalog', cluster: 'starCatalogs', items: STAR_CATALOG_IDS },
  {
    label: 'starCatalog',
    cluster: 'starCatalogs',
    items: LABEL_BEARING_STAR_CATALOG_IDS,
    of: 'starCatalog',
    recession: 'mild',
  },
] as const satisfies readonly VisibilityEntry[];
