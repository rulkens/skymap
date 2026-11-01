import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { satellite } from '../../../data/bodies/makers/satellite';
import { satelliteBody } from './makers/satelliteBody';
import { SAT_ROCK } from '../../../data/bodies/palette';

export const PHOBOS: LayerBody = {
  // reliefM: the shape models' measured radius extremes (8.10–13.94 km, 3.58–8.71 km),
  // so the outer bound — camera floor, glint footprint — encloses the drawn mesh.
  body: satelliteBody({
    id: 'phobos',
    label: 'Phobos',
    datumRadiusM: 11000,
    reliefM: [-2901, 2942],
    albedo: [0.3, 0.29, 0.28],
  }),
  // Mars' moons. JPL sats/elem (Laplace frame, epoch 2000-01-01.5 TDB). Columns
  // transcribed verbatim: a(km) e ω° M° i° node° P(d) Papsis(yr) Pnode(yr),
  // pole RA/Dec (tilt of Laplace plane off the equator).
  position: {
    kind: 'orbit',
    elements: satellite({
      // Phobos: a=9375 e=0.015 ω=216.3 M=189.7 i=1.1 node=169.2 P=0.3187
      // Papsis=1.1 Pnode=2.3; pole RA=317.7 Dec=52.9 (tilt 0.0°). Prograde.
      id: 'phobos',
      focusId: 'mars',
      semiMajorKm: 9375,
      eccentricity: 0.015,
      inclinationDeg: 1.1,
      ascendingNodeDeg: 169.2,
      argPeriapsisDeg: 216.3,
      meanAnomalyDeg: 189.7,
      periodDays: 0.3187,
      periodKind: 'anomalistic',
      apsidalPrecessionYears: 1.1,
      nodalPrecessionYears: 2.3,
      poleRaDeg: 317.7,
      poleDecDeg: 52.9,
      color: SAT_ROCK,
    }),
  },
  // Synchronous moons face their host by construction; see rotationTidallyLocked.
  // Phobos, Deimos and Titan are untextured, but a surface camera rides their frames:
  // row-less, the Sun would stand still in their skies.
  rotation: {
    kind: 'tidallyLocked',
    id: 'phobos',
    poleRaDeg: 317.68,
    poleDecDeg: 52.9,
  },
};
