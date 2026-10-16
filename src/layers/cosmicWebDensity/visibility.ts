/** What the Layer can show, as data. Imports data only: `appVisibility.ts` derives core's
 * address types from it, and a Layer-typed import would make that a circular alias. */

import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';
import { COSMIC_WEB_DENSITY_SOURCE_ROWS } from './sources/cosmicWebDensitySourceRows';

// One entry for the section and its fields: the cluster's own `enabled` is the section
// switch, which core's section rule ANDs into every field's switch.
export const cosmicWebDensityVisibility = [
  {
    key: 'cosmicWebDensity',
    items: COSMIC_WEB_DENSITY_SOURCE_ROWS.map(([, entry]) => entry.id),
    recession: 'strong',
  },
] as const satisfies readonly VisibilityEntry[];
