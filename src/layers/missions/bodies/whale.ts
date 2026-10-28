/**
 * The whale (Hitchhiker's Guide easter egg): a mesh body on the shared 400 km
 * circular orbit.
 */

import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { meshBody } from '../../../data/bodies/makers/meshBody';
import { satellite } from '../../../data/bodies/makers/satellite';
import { WHALE_GREY } from '../../../data/bodies/palette';
import {
  HITCHHIKER_ORBIT_PERIOD_DAYS,
  HITCHHIKER_ORBIT_SEMI_MAJOR_KM,
} from '../../../data/missions/hitchhikerOrbit';

export const WHALE: LayerBody = {
  body: meshBody({
    id: 'whale',
    label: 'Whale',
    meshKey: 'whale',
    captionRevealM: 300,
  }),
  position: {
    kind: 'orbit',
    // A circular, equatorial 400 km orbit — i=0/node=0/ω=0 are all undefined at this
    // geometry, same convention as Deimos/Dione — riding Earth's OWN
    // equatorial pole (poleRaDeg/poleDecDeg match the 'earth' row in
    // bodies/earth.ts in the body Layer) rather than a distinct Laplace plane.
    elements: satellite({
      id: 'whale',
      focusId: 'earth',
      semiMajorKm: HITCHHIKER_ORBIT_SEMI_MAJOR_KM,
      eccentricity: 0,
      inclinationDeg: 0,
      ascendingNodeDeg: 0,
      argPeriapsisDeg: 0,
      meanAnomalyDeg: 0,
      periodDays: HITCHHIKER_ORBIT_PERIOD_DAYS,
      periodKind: 'anomalistic',
      apsidalPrecessionYears: 0,
      nodalPrecessionYears: 0,
      poleRaDeg: 0.0,
      poleDecDeg: 90.0,
      color: WHALE_GREY,
    }),
  },
  // ORBIT-LOCKED: one turn per orbit about the orbit pole (Earth's own, so α₀/δ₀ match the
  // 'earth' row), holding its head along the velocity and its belly Earthward in the body
  // frame the bake's `bodyFromSource` remap sets (+X nose, -Y dorsal); W₀ phases that to the
  // M = 0 epoch.
  rotation: {
    id: 'whale',
    poleRaDeg: 0.0,
    poleDecDeg: 90.0,
    primeMeridianDeg: 90.0,
    spinRateDegPerDay: 360 / HITCHHIKER_ORBIT_PERIOD_DAYS,
  },
};
