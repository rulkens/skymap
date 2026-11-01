import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { satellite } from '../../../data/bodies/makers/satellite';
import { satelliteBody } from './makers/satelliteBody';
import { CHARON_GREY } from '../../../data/bodies/palette';

export const CHARON: LayerBody = {
  body: satelliteBody({
    id: 'charon',
    label: 'Charon',
    datumRadiusM: 606000, // WGCCRE 2015 (Archinal+18), superseding the 2009 report's 605 km.
    albedo: [0.4, 0.39, 0.38],
  }),
  // JPL sats/elem/sep.html "Satellites of Pluto" (mean EQUATORIAL elements, epoch 2000-01-01.5
  // TDB, ephemeris PLU060; Brozović & Jacobson 2024, AJ 167:256).
  position: {
    kind: 'orbit',
    elements: satellite({
      // Verbatim: a=19600. e=0.000 ω=0.0 M=304.1 i=0.0 node=0.0 P=6.387222 Papsis=- Pnode=-.
      // Given in Pluto's own equatorial plane, so the pole below is Pluto's. Papsis/Pnode are
      // published "-" (e=0, i=0 make them meaningless); passed as 0, which
      // moonRatesFromPeriods's MIN_PRECESSION_YEARS guard freezes (as deimos/dione/tethys).
      // LANDMINE: the legend calls P "sidereal period" (the Moon's moonRatesFromSiderealPeriods
      // route), but with both precession rates frozen the two readings coincide for THIS row only.
      id: 'charon',
      focusId: 'pluto',
      semiMajorKm: 19600,
      eccentricity: 0.0,
      inclinationDeg: 0.0,
      ascendingNodeDeg: 0.0,
      argPeriapsisDeg: 0.0,
      meanAnomalyDeg: 304.1,
      periodDays: 6.387222,
      periodKind: 'anomalistic',
      apsidalPrecessionYears: 0.0,
      nodalPrecessionYears: 0.0,
      // Pluto's IAU pole (WGCCRE 2015): the pair is mutually tidally locked, so the poles coincide.
      poleRaDeg: 132.993,
      poleDecDeg: -6.163,
      // LANDMINE — do not "fix": Pluto stays pinned at its heliocentric position, not orbiting
      // the barycentre ~2130 km from its centre (JPL GMs 106.1 / 869.3, ~11% of 19600 km), ~940 km
      // above the surface. Deliberate; see docs/backlog/2026-08-16-barycentric-orbit-pairs.md.
      color: CHARON_GREY,
    }),
  },
  // Shared with Pluto's row by tidal lock, not copy-paste: identical pole, W₀ exactly 180° apart,
  // and Ẇ = 360°/6.387222 d (56.3625225 × 6.387222 = 359.99994°, rounding residual).
  rotation: {
    id: 'charon',
    poleRaDeg: 132.993,
    poleDecDeg: -6.163,
    primeMeridianDeg: 122.695,
    spinRateDegPerDay: 56.3625225,
  },
};
