// Data only: `appVisibility.ts` derives core's address types from this.

import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';
import { SURVEY_DEEP_ZOOM } from '../../data/bands/surveyDeepZoom';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../data/rendering/foregroundMaxDistance';
import { MILKY_WAY_RADIUS_MPC } from '../../data/milkyWay/milkyWayRadiusMpc';
import { STRUCTURE_IDS } from '../../data/structure/structureIds';
import { STRUCTURE_IDS_BY_SCALE } from '../../data/structure/structureIdsByScale';

export const structureVisibility = [
  {
    key: 'structureRing',
    cluster: 'structures',
    items: STRUCTURE_IDS,
    recession: 'mild',
    // Cosmic rings yield to the local starfield with the survey; the Milky Way's own places
    // are full out to two radii and gone at the foreground gate, where the survey markers
    // take over. Each band names its scale's categories, so a ring never takes the other's.
    bands: {
      cosmic: { ...SURVEY_DEEP_ZOOM, items: STRUCTURE_IDS_BY_SCALE.cosmic },
      milkyWayPlaces: {
        out: [MILKY_WAY_RADIUS_MPC * 2, FOREGROUND_MAX_DISTANCE_MPC],
        items: STRUCTURE_IDS_BY_SCALE.milkyWay,
      },
    },
  },
  {
    label: 'structure',
    cluster: 'structures',
    items: STRUCTURE_IDS,
    of: 'structureRing',
    recession: 'mild',
  },
] as const satisfies readonly VisibilityEntry[];
