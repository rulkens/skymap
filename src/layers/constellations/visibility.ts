// Data only: `appVisibility.ts` derives core's address types from this.

import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';
import { NEIGHBOURHOOD_RECEDE_KPC } from '../../data/bands/neighbourhoodRecedeKpc';
import { SCALE_UNITS } from '../../data/scaleUnits';

const KPC = SCALE_UNITS.KPC_TO_MPC;

// True-3D figures read as Earth's sky from within the neighbourhood and shear apart on
// pull-back; the names follow through `of`.
export const constellationsVisibility = [
  {
    key: 'constellations',
    recession: 'strong',
    bands: { neighbourhood: { out: [1 * KPC, NEIGHBOURHOOD_RECEDE_KPC * KPC] } },
  },
  { label: 'constellations', cluster: 'constellations', of: 'constellations', recession: 'strong' },
] as const satisfies readonly VisibilityEntry[];
