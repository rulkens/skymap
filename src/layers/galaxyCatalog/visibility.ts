// Data only: `appVisibility.ts` derives core's address types from this.

import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';
import { SURVEY_DEEP_ZOOM } from '../../data/bands/surveyDeepZoom';
import { GALAXY_CATALOG_IDS } from '../../data/galaxyCatalog/galaxyCatalogIds';
import { GALAXY_CATALOG_SOURCE_ROWS } from './sources/galaxyCatalogSourceRows';

// A single-parameter `.filter` is what lets `tsc` infer the narrowing predicate.
const LABEL_BEARING_GALAXY_CATALOG_IDS = GALAXY_CATALOG_SOURCE_ROWS.map(([, entry]) => entry)
  .filter((entry) => entry.bearsLabel)
  .map((entry) => entry.id);

// The famous catalog is exempt from the deep-zoom band on purpose: its ~20 curated
// galaxies stay as landmarks while the survey points yield to the local starfield.
const SURVEY_IDS = GALAXY_CATALOG_IDS.filter((id) => id !== 'famousGalaxy');

export const galaxyCatalogVisibility = [
  {
    key: 'survey',
    cluster: 'galaxyCatalogs',
    items: GALAXY_CATALOG_IDS,
    bands: { deepZoom: { ...SURVEY_DEEP_ZOOM, items: SURVEY_IDS } },
  },
  {
    label: 'famousGalaxy',
    cluster: 'galaxyCatalogs',
    items: LABEL_BEARING_GALAXY_CATALOG_IDS,
    recession: 'mild',
  },
] as const satisfies readonly VisibilityEntry[];
