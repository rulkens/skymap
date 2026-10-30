// Data only: `appVisibility.ts` derives core's address types from this. The band measures from
// Earth's live position, so it holds wherever the clock has carried Earth.

import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';
import { SCENE_EARTH } from '../../data/bodies/sceneEarth';
import { SATELLITE_CLASSES } from '../../data/satellites/satelliteClasses';
import { SATELLITE_FADES as F } from '../../data/satellites/satelliteFades';
import { SCALE_UNITS } from '../../data/scaleUnits';

export const satellitesVisibility = [
  {
    key: 'satellites',
    items: SATELLITE_CLASSES,
    bands: {
      nearEarth: {
        out: [F.fullWithinKm * SCALE_UNITS.KM_TO_MPC, F.goneBeyondKm * SCALE_UNITS.KM_TO_MPC],
        from: SCENE_EARTH.id,
      },
    },
  },
] as const satisfies readonly VisibilityEntry[];
