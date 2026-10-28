import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { satellite } from '../../../data/bodies/makers/satellite';
import { satelliteBody } from './makers/satelliteBody';
import { SAT_ICE } from '../../../data/bodies/palette';

export const TRITON: LayerBody = {
  // Neptunian moon albedos are geometric albedos (NSSDC Neptunian Satellite Fact Sheet).
  body: satelliteBody({
    id: 'triton',
    label: 'Triton',
    datumRadiusM: 1353400,
    albedo: [0.719, 0.719, 0.719],
  }),
  // Neptune's moons. JPL sats/elem (epoch 2000-01-01.5 TDB, NEP097) for Triton and Proteus, each
  // on its own Laplace plane; Nereid (NEP105) is on the ecliptic at 2020-01-01.0 and is moved back
  // to J2000 by hand in nereid.ts, because `satellite()` assumes J2000.
  position: {
    kind: 'orbit',
    elements: satellite({
      // Triton: JPL NEP097 prints a=354800 e=0 M=63.0 i=157.3 node=178.1 P=5.876994 Pnode=340.379.
      // Retrograde (i > 90): the node advances, so Pnode is entered negative (signed period).
      // P is read as the mean-anomaly period: it leaves less drift for the correction than the
      // longitude reading (1.6 against 2.6 deg/yr).
      id: 'triton',
      focusId: 'neptune',
      semiMajorKm: 354800,
      eccentricity: 0.0,
      inclinationDeg: 157.3,
      ascendingNodeDeg: 178.1,
      argPeriapsisDeg: 0.0,
      meanAnomalyDeg: 63.0,
      periodDays: 5.876994,
      periodKind: 'anomalistic',
      apsidalPrecessionYears: 0.0,
      nodalPrecessionYears: -340.379,
      poleRaDeg: 299.8,
      poleDecDeg: 43.1,
      color: SAT_ICE,
    }),
  },
  // Triton's IAU pole swings over 20 degrees (periods of ~680 yr), so a fixed IAU constant is wrong
  // at most dates. The pole is instead opposite the J2000 orbit normal Horizons gives (i 157.3,
  // node 176.77): RA 298.470, Dec 20.427, 0.13 degrees from the WGCCRE 2015 value. The drawn moon
  // follows Horizons, not the mean row (node 178.1, which would put the pole 0.5 degrees out).
  rotation: {
    kind: 'tidallyLocked',
    id: 'triton',
    poleRaDeg: 298.47,
    poleDecDeg: 20.427,
  },
};
