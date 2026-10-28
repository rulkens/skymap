import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { satellite } from '../../../data/bodies/makers/satellite';
import { satelliteBody } from './makers/satelliteBody';
import { SAT_ICE } from '../../../data/bodies/palette';

export const MIRANDA: LayerBody = {
  // Uranian moon albedos are geometric albedos (NSSDC Uranian Satellite Fact Sheet); the
  // texture build reads them back as the mean of each Schenk mosaic's brightness.
  body: satelliteBody({
    id: 'miranda',
    label: 'Miranda',
    datumRadiusM: 235800,
    albedo: [0.32, 0.32, 0.32],
  }),
  // Uranus's moons. JPL sats/elem (Uranus-equatorial frame, epoch 2000-01-01.5 TDB, URA182), which
  // tabulates no pole. The pole below is Uranus's ANGULAR-MOMENTUM pole (RA 77.311, Dec +15.175),
  // the antipode of its IAU north pole: Uranus spins retrograde about that pole and the moons orbit
  // with the spin, so the IAU pole here would run every orbit backwards.
  // P is a LONGITUDE period, as for Saturn: 360/P matches the IAU (WGCCRE 2009) spin rates.
  position: {
    kind: 'orbit',
    elements: satellite({
      // Miranda: a=129846 e=0.001 ω=154.8 M=73.0 i=4.4 node=100.9 P=1.413479
      // Papsis=8.939 Pnode=17.787. Prograde.
      id: 'miranda',
      focusId: 'uranus',
      semiMajorKm: 129846,
      eccentricity: 0.001,
      inclinationDeg: 4.4,
      ascendingNodeDeg: 100.9,
      argPeriapsisDeg: 154.8,
      meanAnomalyDeg: 73.0,
      periodDays: 1.413479,
      periodKind: 'longitude',
      apsidalPrecessionYears: 8.939,
      nodalPrecessionYears: 17.787,
      poleRaDeg: 77.311,
      poleDecDeg: 15.175,
      color: SAT_ICE,
    }),
  },
  rotation: {
    kind: 'tidallyLocked',
    id: 'miranda',
    poleRaDeg: 257.43,
    poleDecDeg: -15.08,
  },
};
