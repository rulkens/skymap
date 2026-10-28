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
  // Charon comes from a different page than every satellite() row above: JPL
  // sats/elem/sep.html "Satellites of Pluto" (mean EQUATORIAL orbital elements, epoch
  // 2000-01-01.5 TDB, ephemeris PLU060; Brozović & Jacobson 2024, AJ 167:256).
  position: {
    kind: 'orbit',
    elements: satellite({
      // Charon, plutocentric. Verbatim: a=19600. e=0.000 ω=0.0 M=304.1 i=0.0 node=0.0
      // P=6.387222 Papsis=- Pnode=-. Given DIRECTLY in Pluto's own equatorial plane, with no
      // per-moon Laplace pole column unlike elem.html, so the pole below is Pluto's own.
      // Papsis/Pnode are published "-" (undefined, not 0.000): e=0.000 and i=0.0 leave periapsis
      // and node geometrically meaningless. Passed as 0, which moonRatesFromPeriods's
      // MIN_PRECESSION_YEARS guard freezes to zero drift — the same degenerate case as
      // Deimos/Dione/Tethys above. LANDMINE: the legend calls P "sidereal period", the word that
      // routes the Moon through moonRatesFromSiderealPeriods instead, but with both precession
      // rates frozen meanAnomalyRate = meanLongitudeRate − 0 − 0, so the two readings of P
      // coincide for THIS row only. Revisit if JPL ever publishes nonzero e/i.
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
      // Pluto's IAU pole (WGCCRE 2015), not a Charon one: the pair is mutually tidally locked,
      // so the poles coincide exactly — see `rotationElements.ts` for the same lock's other
      // three shared numbers.
      poleRaDeg: 132.993,
      poleDecDeg: -6.163,
      // LANDMINE — do not "fix": Pluto stays pinned at its heliocentric position
      // rather than orbiting the Pluto–Charon barycentre, which sits ~2130 km from
      // Pluto's CENTRE (JPL GMs 106.1 / 869.3 put it ~11% along the 19600 km
      // separation) — 1.8 Pluto radii, so ~940 km above the surface and visibly
      // off, unlike the same approximation Earth–Moon already makes. Deliberate;
      // the fix is scoped in docs/backlog/2026-08-16-barycentric-orbit-pairs.md.
      color: CHARON_GREY,
    }),
  },
  // LANDMINE — what this row shares with Pluto's is physics, not copy-paste: mutual tidal lock
  // means one spin axis (identical pole), each prime meridian is the sub-companion one (W₀
  // exactly 180° apart), and rotation and orbit are one quantity measured twice (Ẇ =
  // 360°/6.387222 d, Charon's period in `orbitalElements.ts`; 56.3625225 × 6.387222 =
  // 359.99994°, the residual being their rounding).
  rotation: {
    id: 'charon',
    poleRaDeg: 132.993,
    poleDecDeg: -6.163,
    primeMeridianDeg: 122.695,
    spinRateDegPerDay: 56.3625225,
  },
};
