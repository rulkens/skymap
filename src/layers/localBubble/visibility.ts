// Data only: `appVisibility.ts` derives core's address types from this.

import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';
import { NEIGHBOURHOOD_RECEDE_KPC } from '../../data/bands/neighbourhoodRecedeKpc';
import { SCALE_UNITS } from '../../data/scaleUnits';

const KPC = SCALE_UNITS.KPC_TO_MPC;

// Invisible from deep inside: the in-edge sits below the mesh's ~536 pc max radius, so the
// far lobes (the chimney) start to fade in with the camera still inside. Full by 1 kpc.
export const localBubbleVisibility = [
  {
    key: 'localBubble',
    recession: 'strong',
    bands: {
      shell: { in: [0.4 * KPC, 1 * KPC], out: [4 * KPC, NEIGHBOURHOOD_RECEDE_KPC * KPC] },
    },
  },
] as const satisfies readonly VisibilityEntry[];
