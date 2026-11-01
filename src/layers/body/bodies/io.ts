import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { satellite } from '../../../data/bodies/makers/satellite';
import { satelliteBody } from './makers/satelliteBody';
import { IO_SULFUR } from '../../../data/bodies/palette';

export const IO: LayerBody = {
  body: satelliteBody({ id: 'io', label: 'Io', datumRadiusM: 1822000, albedo: [0.6, 0.55, 0.32] }),
  // Jupiter's Galilean moons. JPL sats/elem (Laplace frame, epoch 2000-01-01.5
  // TDB, JUP365). Columns verbatim: a(km) e ω° M° i° node° P(d) Papsis(yr)
  // Pnode(yr), pole RA/Dec. P is the anomalistic mean-motion period — for the
  // fast-precessing inner pair it is ~0.4% shorter than the sidereal period. JPL lists Papsis
  // unsigned; Io's and Europa's apsides regress (Laplace resonance), so their rows carry it
  // negative — read +, their longitude runs ~0.74°/day fast.
  position: {
    kind: 'orbit',
    elements: satellite({
      // Io: a=421800 e=0.004 ω=49.1 M=330.9 i=0.0 node=0.0 P=1.762732
      // Papsis=1.333 Pnode=0.000; pole RA=268.1 Dec=64.5 (tilt 0.0°). Prograde.
      // i≈0 ⇒ node undefined, Pnode=0.000 ⇒ Ω-rate frozen to 0.
      id: 'io',
      focusId: 'jupiter',
      semiMajorKm: 421800,
      eccentricity: 0.004,
      inclinationDeg: 0.0,
      ascendingNodeDeg: 0.0,
      argPeriapsisDeg: 49.1,
      meanAnomalyDeg: 330.9,
      periodDays: 1.762732,
      periodKind: 'anomalistic',
      apsidalPrecessionYears: -1.333,
      nodalPrecessionYears: 0.0,
      poleRaDeg: 268.1,
      poleDecDeg: 64.5,
      color: IO_SULFUR,
    }),
  },
  rotation: {
    kind: 'tidallyLocked',
    id: 'io',
    poleRaDeg: 268.05,
    poleDecDeg: 64.5,
  },
};
