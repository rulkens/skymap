// Data only: `appVisibility.ts` derives core's address types from this.

import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';
import { ASTEROID_CLASSES } from '../../data/asteroids/asteroidClasses';
import { SCALE_UNITS } from '../../data/scaleUnits';
import { ASTEROID_FADES as F } from './points/data/asteroidFades';

export const asteroidsVisibility = [
  {
    key: 'asteroids',
    items: ASTEROID_CLASSES,
    selects: ['asteroid'],
    bands: {
      solarSystem: {
        out: [F.fullWithinAu * SCALE_UNITS.AU_TO_MPC, F.goneBeyondAu * SCALE_UNITS.AU_TO_MPC],
        from: 'solar-system', // the region's anchor: the Sun
      },
    },
  },
] as const satisfies readonly VisibilityEntry[];
