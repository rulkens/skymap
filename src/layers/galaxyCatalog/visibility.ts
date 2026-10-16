// Data only: `appVisibility.ts` derives core's address types from this.

import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';
import { GALAXY_CATALOG_IDS } from '../../data/galaxyCatalog/galaxyCatalogIds';
import { GALAXY_CATALOG_SOURCE_ROWS } from './sources/galaxyCatalogSourceRows';

// A single-parameter `.filter` is what lets `tsc` infer the narrowing predicate.
const LABEL_BEARING_GALAXY_CATALOG_IDS = GALAXY_CATALOG_SOURCE_ROWS.map(([, entry]) => entry)
  .filter((entry) => entry.bearsLabel)
  .map((entry) => entry.id);

export const galaxyCatalogVisibility = [
  { key: 'survey', cluster: 'galaxyCatalogs', items: GALAXY_CATALOG_IDS },
  {
    label: 'famousGalaxy',
    cluster: 'galaxyCatalogs',
    items: LABEL_BEARING_GALAXY_CATALOG_IDS,
    recession: 'mild',
  },
] as const satisfies readonly VisibilityEntry[];
