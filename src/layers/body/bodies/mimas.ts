import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { satellite } from '../../../data/bodies/makers/satellite';
import { satelliteBody } from './makers/satelliteBody';
import { SAT_ICE } from '../../../data/bodies/palette';

export const MIMAS: LayerBody = {
  body: satelliteBody({
    id: 'mimas',
    label: 'Mimas',
    datumRadiusM: 198000,
    albedo: [0.72, 0.73, 0.73],
  }),
  // Saturn's major moons. JPL sats/elem (Laplace frame, epoch 2000-01-01.5 TDB, SAT441).
  // Columns verbatim: a(km) e ω° M° i° node° P(d) Papsis(yr) Pnode(yr), pole RA/Dec. The inner
  // moons share Saturn's pole (RA≈40.6 Dec≈83.5); Iapetus sits far enough out that its Laplace
  // plane tilts 14.8° off the equator, which its own pole and i=7.6° carry truthfully. P is a
  // LONGITUDE period here (360/P equals the IAU spin rate), hence `periodKind: 'longitude'`.
  position: {
    kind: 'orbit',
    elements: satellite({
      // Mimas: a=186000 e=0.020 ω=160.4 M=275.3 i=1.6 node=66.2 P=0.942422
      // Papsis=0.493 Pnode=0.986; pole RA=40.6 Dec=83.5 (tilt 0.0°). Prograde.
      id: 'mimas',
      focusId: 'saturn',
      semiMajorKm: 186000,
      eccentricity: 0.02,
      inclinationDeg: 1.6,
      ascendingNodeDeg: 66.2,
      argPeriapsisDeg: 160.4,
      meanAnomalyDeg: 275.3,
      periodDays: 0.942422,
      periodKind: 'longitude',
      apsidalPrecessionYears: 0.493,
      nodalPrecessionYears: 0.986,
      poleRaDeg: 40.6,
      poleDecDeg: 83.5,
      color: SAT_ICE,
    }),
  },
  rotation: {
    kind: 'tidallyLocked',
    id: 'mimas',
    poleRaDeg: 40.66,
    poleDecDeg: 83.52,
  },
};
