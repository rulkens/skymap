// Data only: `appVisibility.ts` derives core's address types from this.

import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';
import { STRUCTURE_IDS } from '../../data/structure/structureIds';

export const structureVisibility = [
  { key: 'structureRing', cluster: 'structures', items: STRUCTURE_IDS, recession: 'mild' },
  {
    label: 'structure',
    cluster: 'structures',
    items: STRUCTURE_IDS,
    of: 'structureRing',
    recession: 'mild',
  },
] as const satisfies readonly VisibilityEntry[];
