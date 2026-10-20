// Data only: `appVisibility.ts` derives core's address types from this.

import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';
import { SURVEY_DEEP_ZOOM } from '../../data/bands/surveyDeepZoom';
import { COSMIC_WEB_DENSITY_SOURCE_ROWS } from './sources/cosmicWebDensitySourceRows';

// One entry for the section and its fields: the cluster's own `enabled` is the section
// switch, which core's section rule ANDs into every field's switch.
export const cosmicWebDensityVisibility = [
  {
    key: 'cosmicWebDensity',
    items: COSMIC_WEB_DENSITY_SOURCE_ROWS.map(([, entry]) => entry.id),
    recession: 'strong',
    bands: { deepZoom: SURVEY_DEEP_ZOOM },
  },
] as const satisfies readonly VisibilityEntry[];
