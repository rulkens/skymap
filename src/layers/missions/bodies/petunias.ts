/**
 * The bowl of petunias (Hitchhiker's Guide easter egg): trails the whale on the
 * shared 400 km orbit.
 */

import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { meshBody } from '../../../data/bodies/makers/meshBody';
import { satellite } from '../../../data/bodies/makers/satellite';
import { PETUNIA_PINK } from '../../../data/bodies/palette';
import {
  HITCHHIKER_ORBIT_PERIOD_DAYS,
  HITCHHIKER_ORBIT_SEMI_MAJOR_KM,
  PETUNIA_TRAIL_OFFSET_DEG,
} from '../../../data/missions/hitchhikerOrbit';

export const PETUNIAS: LayerBody = {
  body: meshBody({
    id: 'petunias',
    label: 'Bowl of Petunias',
    meshKey: 'petunias',
    captionRevealM: 60,
  }),
  position: {
    kind: 'orbit',
    elements: satellite({
      // Trails the whale by PETUNIA_TRAIL_OFFSET_DEG in mean anomaly — behind in
      // the direction of travel, so a smaller M at this shared epoch.
      id: 'petunias',
      focusId: 'earth',
      semiMajorKm: HITCHHIKER_ORBIT_SEMI_MAJOR_KM,
      eccentricity: 0,
      inclinationDeg: 0,
      ascendingNodeDeg: 0,
      argPeriapsisDeg: 0,
      meanAnomalyDeg: -PETUNIA_TRAIL_OFFSET_DEG,
      periodDays: HITCHHIKER_ORBIT_PERIOD_DAYS,
      periodKind: 'anomalistic',
      apsidalPrecessionYears: 0,
      nodalPrecessionYears: 0,
      poleRaDeg: 0.0,
      poleDecDeg: 90.0,
      color: PETUNIA_PINK,
    }),
  },
  // The pot's pole stays DECORATIVE — off-axis and quick, a turn per 90 s, so its tumble wobbles.
  rotation: {
    id: 'petunias',
    poleRaDeg: 198.6,
    poleDecDeg: -37.2,
    primeMeridianDeg: 0.0,
    spinRateDegPerDay: 345600,
  },
};
