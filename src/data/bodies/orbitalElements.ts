/**
 * orbitalElements — the J2000 Keplerian element table, the single source of
 * truth for BOTH the scene's foreground body positions AND their orbit trails.
 *
 * ### Why this table is upstream of everything
 *
 * The old dependency ran body-seed → orbit-ring: a ring derived its radius from
 * `|body − parent|`, so a circle always passed through its body. That inversion
 * cannot survive real ellipses — a body at an arbitrary placeholder position is
 * not generally *on* a Keplerian ellipse fitted from independent elements, so
 * the sphere would float off its own trail. We invert the dependency: elements
 * are authored here, and both the body's rendered position
 * (`keplerianPositionMpc`) and its trail conic (`keplerianEllipse`) DERIVE from
 * this one table. Body-on-trail consistency is then structural — not a
 * "remember to keep them in sync" invariant.
 *
 * ### Frames — heliocentric vs geocentric, ecliptic vs equatorial
 *
 * Two independent frame choices per row:
 *
 * - **Focus** (`focusId`): the eight major planets (Mercury through Neptune,
 *   Earth as the EMB) are **heliocentric** — `focusId: 'sun'`, focus at the Sun
 *   (the render origin). A moon is **geocentric** to its planet — `focusId`
 *   names it — so its focus resolves to that planet's own derived world position
 *   and its trail follows the planet by construction.
 * - **Reference plane** (`plane`, see `orbitPlaneFrames.ts`): the planets AND
 *   Earth's Moon are referenced to the **ecliptic** (JPL publishes them there),
 *   the default when `plane` is omitted. But a planet's OWN moons are referenced
 *   to their **local Laplace plane** — Saturn's regular moons ride ~27° off the
 *   ecliptic, which is why they look visibly tilted — so each satellite row's
 *   `plane` is built by the `satellite` maker from that moon's OWN Laplace-plane
 *   pole (the `poleRaDeg`/`poleDecDeg` JPL tabulates), not from a shared
 *   equatorial constant: the inner moons' poles ≈ the planet's equatorial pole,
 *   but a distant moon's Laplace plane tilts off the equator (Iapetus ~15°) and
 *   its own pole captures that. The ecliptic→equatorial rotation into the
 *   scene's frame is `ECLIPTIC_FRAME` (see `orbitPlaneFrames.ts`), applied
 *   downstream where the ellipse is built.
 *
 * Each planet row carries its J2000 epoch elements AND the six per-Julian-
 * century rates from the same JPL table, so `propagateElements` can advance the
 * body to any simulated instant. The Moon and the satellite rows carry the same
 * epoch elements + rates, converted by the `satellite` maker (and, for the Moon,
 * by `moonRatesFromSiderealPeriods` inline — its P column is the sidereal month
 * where the satellites' is the mean-anomaly period; see the Moon row) from JPL's
 * period columns; so the mixed table stays uniform and one affine map moves
 * every body.
 *
 * ### Authoring discipline
 *
 * No buried Mpc / radian literals: every distance is `<human value> *
 * SCALE_UNITS.…` (au / km → Mpc) and every angle is `degToRad(<deg>)`, the same
 * discipline the scene body tables observe. JPL tabulates the planets by mean
 * longitude `L` and longitude of perihelion `ϖ`; the classical `ω` and `M` are
 * derived at the seed site via `ω = ϖ − Ω` and `M = L − ϖ`, with that
 * arithmetic written out inline so the transcription stays checkable. The rates
 * follow the same discipline: the raw JPL rate columns (`dL/dt`, `dϖ/dt`,
 * `dΩ/dt`, …) sit in each row comment, and `dM/dt = dL/dt − dϖ/dt`,
 * `dω/dt = dϖ/dt − dΩ/dt` are shown inline, mirroring the `M`/`ω` derivations.
 *
 * ### Provenance (J2000 mean elements)
 *
 * - Planets: JPL SSD "Keplerian Elements for Approximate Positions of the Major
 *   Planets", Table 1 (valid 1800–2050 AD, mean ecliptic and equinox of J2000).
 *   https://ssd.jpl.nasa.gov/planets/approx_pos.html
 * - Moon + the 13 planetary satellites: JPL SSD "Planetary Satellite Mean
 *   Orbital Parameters" (epoch 2000-01-01.5 TDB; the Moon in the ecliptic frame,
 *   the planets' moons each in their local Laplace plane). Each row transcribes
 *   that moon's full table line — a, e, i, node Ω, ω, M, and the sidereal /
 *   apsidal / nodal periods P / Papsis / Pnode, plus the Laplace-plane pole
 *   RA/Dec — verbatim in its comment. These describe a precessing mean ellipse,
 *   exactly what a guidance trail needs. https://ssd.jpl.nasa.gov/sats/elem/
 */

import { SCALE_UNITS } from '../scaleUnits';
import { satellite } from './makers/satellite';
import { sStar } from './makers/sStar';
import { S_STAR_SEEDS } from './sStarElements';
import { moonRatesFromSiderealPeriods } from '../../utils/orbit/moonRatesFromSiderealPeriods';
import {
  MERCURY_GREY,
  VENUS_CREAM,
  EARTH_BLUE,
  MARS_RED,
  JUPITER_TAN,
  SATURN_GOLD,
  URANUS_CYAN,
  NEPTUNE_BLUE,
  MOON_GREY,
  SAT_ROCK,
  SAT_ICE,
  IO_SULFUR,
  TITAN_ORANGE,
} from './palette';
import { degToRad } from '../../utils/math/degToRad';
import { findByIdOrThrow } from '../../utils/object/findByIdOrThrow';
import type { OrbitalElements } from '../../@types/scene/OrbitalElements';

/**
 * Look up a body's J2000 Keplerian seed by id — the domain wrapper the body
 * makers derive positions through. A find-over-a-table lives with its table, so
 * both the scene body seeds and this module read the one source of truth; the
 * throw-on-miss (via `findByIdOrThrow`) fires at module load so a typo fails
 * loudly rather than silently seeding a body at `undefined`/NaN.
 */
export function elementsById(id: string): OrbitalElements {
  return findByIdOrThrow(ORBITAL_ELEMENTS, id, 'orbitalElements');
}

/**
 * The guidance orbits: the eight major planets (heliocentric, in order outward
 * from the Sun), then the Moon (geocentric, ecliptic), then each planet's own
 * major moons (geocentric, each in its own Laplace `plane` — see `satellite`).
 * Planet columns are authored in the units JPL publishes (au / km, degrees) and
 * converted at the seed site; `ω` and `M` show their `ϖ`/`L`/`Ω` derivation
 * inline. Moon rows go through `satellite`, which transcribes the full JPL
 * satellite-elements line — real epoch phases Ω/ω/M and the period columns → the
 * shared per-century rates — so the moons sit at their true J2000 positions and
 * animate with everything else.
 */
export const ORBITAL_ELEMENTS: readonly OrbitalElements[] = [
  {
    // Mercury, heliocentric. JPL: L = 252.25032350°, ϖ = 77.45779628°,
    // Ω = 48.33076593°.
    id: 'mercury',
    focusId: 'sun',
    semiMajorMpc: 0.38709927 * SCALE_UNITS.AU_TO_MPC,
    eccentricity: 0.20563593,
    inclinationRad: degToRad(7.00497902),
    ascendingNodeRad: degToRad(48.33076593),
    // ω = ϖ − Ω = 77.45779628 − 48.33076593
    argPeriapsisRad: degToRad(77.45779628 - 48.33076593),
    // M = L − ϖ = 252.25032350 − 77.45779628
    meanAnomalyRad: degToRad(252.2503235 - 77.45779628),
    // Rates (JPL, per Julian century): dL/dt = 149472.67411175, dϖ/dt = 0.16047689,
    // dΩ/dt = −0.12534081, da/dt = 0.00000037 au, de/dt = 0.00001906, dI/dt = −0.00594749.
    semiMajorRateMpcPerCty: 0.00000037 * SCALE_UNITS.AU_TO_MPC,
    eccentricityRatePerCty: 0.00001906,
    inclinationRateRadPerCty: degToRad(-0.00594749),
    ascendingNodeRateRadPerCty: degToRad(-0.12534081),
    // dω/dt = dϖ/dt − dΩ/dt = 0.16047689 − (−0.12534081)
    argPeriapsisRateRadPerCty: degToRad(0.16047689 - -0.12534081),
    // dM/dt = dL/dt − dϖ/dt = 149472.67411175 − 0.16047689
    meanAnomalyRateRadPerCty: degToRad(149472.67411175 - 0.16047689),
    color: MERCURY_GREY,
  },
  {
    // Venus, heliocentric. JPL: L = 181.97909950°, ϖ = 131.60246718°,
    // Ω = 76.67984255°.
    id: 'venus',
    focusId: 'sun',
    semiMajorMpc: 0.72333566 * SCALE_UNITS.AU_TO_MPC,
    eccentricity: 0.00677672,
    inclinationRad: degToRad(3.39467605),
    ascendingNodeRad: degToRad(76.67984255),
    // ω = ϖ − Ω = 131.60246718 − 76.67984255
    argPeriapsisRad: degToRad(131.60246718 - 76.67984255),
    // M = L − ϖ = 181.97909950 − 131.60246718
    meanAnomalyRad: degToRad(181.9790995 - 131.60246718),
    // Rates (JPL, per Julian century): dL/dt = 58517.81538729, dϖ/dt = 0.00268329,
    // dΩ/dt = −0.27769418, da/dt = 0.00000390 au, de/dt = −0.00004107, dI/dt = −0.00078890.
    semiMajorRateMpcPerCty: 0.0000039 * SCALE_UNITS.AU_TO_MPC,
    eccentricityRatePerCty: -0.00004107,
    inclinationRateRadPerCty: degToRad(-0.0007889),
    ascendingNodeRateRadPerCty: degToRad(-0.27769418),
    // dω/dt = dϖ/dt − dΩ/dt = 0.00268329 − (−0.27769418)
    argPeriapsisRateRadPerCty: degToRad(0.00268329 - -0.27769418),
    // dM/dt = dL/dt − dϖ/dt = 58517.81538729 − 0.00268329
    meanAnomalyRateRadPerCty: degToRad(58517.81538729 - 0.00268329),
    color: VENUS_CREAM,
  },
  {
    // Earth–Moon barycenter, heliocentric. JPL: L = 100.46457166°,
    // ϖ = 102.93768193°, Ω = 0.0°.
    id: 'earth',
    focusId: 'sun',
    semiMajorMpc: 1.00000261 * SCALE_UNITS.AU_TO_MPC,
    eccentricity: 0.01671123,
    inclinationRad: degToRad(-0.00001531),
    ascendingNodeRad: degToRad(0.0),
    // ω = ϖ − Ω = 102.93768193 − 0.0
    argPeriapsisRad: degToRad(102.93768193 - 0.0),
    // M = L − ϖ = 100.46457166 − 102.93768193
    meanAnomalyRad: degToRad(100.46457166 - 102.93768193),
    // Rates (JPL, per Julian century): dL/dt = 35999.37244981, dϖ/dt = 0.32327364,
    // dΩ/dt = 0.0, da/dt = 0.00000562 au, de/dt = −0.00004392, dI/dt = −0.01294668.
    semiMajorRateMpcPerCty: 0.00000562 * SCALE_UNITS.AU_TO_MPC,
    eccentricityRatePerCty: -0.00004392,
    inclinationRateRadPerCty: degToRad(-0.01294668),
    ascendingNodeRateRadPerCty: degToRad(0.0),
    // dω/dt = dϖ/dt − dΩ/dt = 0.32327364 − 0.0
    argPeriapsisRateRadPerCty: degToRad(0.32327364 - 0.0),
    // dM/dt = dL/dt − dϖ/dt = 35999.37244981 − 0.32327364
    meanAnomalyRateRadPerCty: degToRad(35999.37244981 - 0.32327364),
    color: EARTH_BLUE,
  },
  {
    // Mars, heliocentric. JPL: L = −4.55343205°, ϖ = −23.94362959°,
    // Ω = 49.55953891°.
    id: 'mars',
    focusId: 'sun',
    semiMajorMpc: 1.52371034 * SCALE_UNITS.AU_TO_MPC,
    eccentricity: 0.0933941,
    inclinationRad: degToRad(1.84969142),
    ascendingNodeRad: degToRad(49.55953891),
    // ω = ϖ − Ω = −23.94362959 − 49.55953891
    argPeriapsisRad: degToRad(-23.94362959 - 49.55953891),
    // M = L − ϖ = −4.55343205 − (−23.94362959)
    meanAnomalyRad: degToRad(-4.55343205 - -23.94362959),
    // Rates (JPL, per Julian century): dL/dt = 19140.30268499, dϖ/dt = 0.44441088,
    // dΩ/dt = −0.29257343, da/dt = 0.00001847 au, de/dt = 0.00007882, dI/dt = −0.00813131.
    semiMajorRateMpcPerCty: 0.00001847 * SCALE_UNITS.AU_TO_MPC,
    eccentricityRatePerCty: 0.00007882,
    inclinationRateRadPerCty: degToRad(-0.00813131),
    ascendingNodeRateRadPerCty: degToRad(-0.29257343),
    // dω/dt = dϖ/dt − dΩ/dt = 0.44441088 − (−0.29257343)
    argPeriapsisRateRadPerCty: degToRad(0.44441088 - -0.29257343),
    // dM/dt = dL/dt − dϖ/dt = 19140.30268499 − 0.44441088
    meanAnomalyRateRadPerCty: degToRad(19140.30268499 - 0.44441088),
    color: MARS_RED,
  },
  {
    // Jupiter, heliocentric. JPL: L = 34.39644051°, ϖ = 14.72847983°,
    // Ω = 100.47390909°.
    id: 'jupiter',
    focusId: 'sun',
    semiMajorMpc: 5.202887 * SCALE_UNITS.AU_TO_MPC,
    eccentricity: 0.04838624,
    inclinationRad: degToRad(1.30439695),
    ascendingNodeRad: degToRad(100.47390909),
    // ω = ϖ − Ω = 14.72847983 − 100.47390909
    argPeriapsisRad: degToRad(14.72847983 - 100.47390909),
    // M = L − ϖ = 34.39644051 − 14.72847983
    meanAnomalyRad: degToRad(34.39644051 - 14.72847983),
    // Rates (JPL, per Julian century): dL/dt = 3034.74612775, dϖ/dt = 0.21252668,
    // dΩ/dt = 0.20469106, da/dt = −0.00011607 au, de/dt = −0.00013253, dI/dt = −0.00183714.
    semiMajorRateMpcPerCty: -0.00011607 * SCALE_UNITS.AU_TO_MPC,
    eccentricityRatePerCty: -0.00013253,
    inclinationRateRadPerCty: degToRad(-0.00183714),
    ascendingNodeRateRadPerCty: degToRad(0.20469106),
    // dω/dt = dϖ/dt − dΩ/dt = 0.21252668 − 0.20469106
    argPeriapsisRateRadPerCty: degToRad(0.21252668 - 0.20469106),
    // dM/dt = dL/dt − dϖ/dt = 3034.74612775 − 0.21252668
    meanAnomalyRateRadPerCty: degToRad(3034.74612775 - 0.21252668),
    color: JUPITER_TAN,
  },
  {
    // Saturn, heliocentric. JPL: L = 49.95424423°, ϖ = 92.59887831°,
    // Ω = 113.66242448°.
    id: 'saturn',
    focusId: 'sun',
    semiMajorMpc: 9.53667594 * SCALE_UNITS.AU_TO_MPC,
    eccentricity: 0.05386179,
    inclinationRad: degToRad(2.48599187),
    ascendingNodeRad: degToRad(113.66242448),
    // ω = ϖ − Ω = 92.59887831 − 113.66242448
    argPeriapsisRad: degToRad(92.59887831 - 113.66242448),
    // M = L − ϖ = 49.95424423 − 92.59887831
    meanAnomalyRad: degToRad(49.95424423 - 92.59887831),
    // Rates (JPL, per Julian century): dL/dt = 1222.49362201, dϖ/dt = −0.41897216,
    // dΩ/dt = −0.28867794, da/dt = −0.00125060 au, de/dt = −0.00050991, dI/dt = 0.00193609.
    semiMajorRateMpcPerCty: -0.0012506 * SCALE_UNITS.AU_TO_MPC,
    eccentricityRatePerCty: -0.00050991,
    inclinationRateRadPerCty: degToRad(0.00193609),
    ascendingNodeRateRadPerCty: degToRad(-0.28867794),
    // dω/dt = dϖ/dt − dΩ/dt = −0.41897216 − (−0.28867794)
    argPeriapsisRateRadPerCty: degToRad(-0.41897216 - -0.28867794),
    // dM/dt = dL/dt − dϖ/dt = 1222.49362201 − (−0.41897216)
    meanAnomalyRateRadPerCty: degToRad(1222.49362201 - -0.41897216),
    color: SATURN_GOLD,
  },
  {
    // Uranus, heliocentric. JPL: L = 313.23810451°, ϖ = 170.95427630°,
    // Ω = 74.01692503°.
    id: 'uranus',
    focusId: 'sun',
    semiMajorMpc: 19.18916464 * SCALE_UNITS.AU_TO_MPC,
    eccentricity: 0.04725744,
    inclinationRad: degToRad(0.77263783),
    ascendingNodeRad: degToRad(74.01692503),
    // ω = ϖ − Ω = 170.95427630 − 74.01692503
    argPeriapsisRad: degToRad(170.9542763 - 74.01692503),
    // M = L − ϖ = 313.23810451 − 170.95427630
    meanAnomalyRad: degToRad(313.23810451 - 170.9542763),
    // Rates (JPL, per Julian century): dL/dt = 428.48202785, dϖ/dt = 0.40805281,
    // dΩ/dt = 0.04240589, da/dt = −0.00196176 au, de/dt = −0.00004397, dI/dt = −0.00242939.
    semiMajorRateMpcPerCty: -0.00196176 * SCALE_UNITS.AU_TO_MPC,
    eccentricityRatePerCty: -0.00004397,
    inclinationRateRadPerCty: degToRad(-0.00242939),
    ascendingNodeRateRadPerCty: degToRad(0.04240589),
    // dω/dt = dϖ/dt − dΩ/dt = 0.40805281 − 0.04240589
    argPeriapsisRateRadPerCty: degToRad(0.40805281 - 0.04240589),
    // dM/dt = dL/dt − dϖ/dt = 428.48202785 − 0.40805281
    meanAnomalyRateRadPerCty: degToRad(428.48202785 - 0.40805281),
    color: URANUS_CYAN,
  },
  {
    // Neptune, heliocentric. JPL: L = −55.12002969°, ϖ = 44.96476227°,
    // Ω = 131.78422574°.
    id: 'neptune',
    focusId: 'sun',
    semiMajorMpc: 30.06992276 * SCALE_UNITS.AU_TO_MPC,
    eccentricity: 0.00859048,
    inclinationRad: degToRad(1.77004347),
    ascendingNodeRad: degToRad(131.78422574),
    // ω = ϖ − Ω = 44.96476227 − 131.78422574
    argPeriapsisRad: degToRad(44.96476227 - 131.78422574),
    // M = L − ϖ = −55.12002969 − 44.96476227
    meanAnomalyRad: degToRad(-55.12002969 - 44.96476227),
    // Rates (JPL, per Julian century): dL/dt = 218.45945325, dϖ/dt = −0.32241464,
    // dΩ/dt = −0.00508664, da/dt = 0.00026291 au, de/dt = 0.00005105, dI/dt = 0.00035372.
    semiMajorRateMpcPerCty: 0.00026291 * SCALE_UNITS.AU_TO_MPC,
    eccentricityRatePerCty: 0.00005105,
    inclinationRateRadPerCty: degToRad(0.00035372),
    ascendingNodeRateRadPerCty: degToRad(-0.00508664),
    // dω/dt = dϖ/dt − dΩ/dt = −0.32241464 − (−0.00508664)
    argPeriapsisRateRadPerCty: degToRad(-0.32241464 - -0.00508664),
    // dM/dt = dL/dt − dϖ/dt = 218.45945325 − (−0.32241464)
    meanAnomalyRateRadPerCty: degToRad(218.45945325 - -0.32241464),
    color: NEPTUNE_BLUE,
  },
  {
    // The Moon, geocentric — its focus is Earth's derived position. JPL sats/elem
    // (ecliptic frame, epoch 2000-01-01.5 TDB, DE405/LE405): a=384400 km,
    // e=0.0554, i=5.16°, node Ω=125.08°, ω=318.15°, M=135.27°, P=27.322 d,
    // Papsis=5.997 yr, Pnode=18.600 yr. JPL gives ω and M directly (no ϖ/L
    // derivation). Periods → rates via moonRatesFromSiderealPeriods (built
    // inline here — the Moon is authored directly, not via `satellite`, but
    // earns the same three rate columns so it animates too). UNLIKE the
    // planetary-satellite rows, whose P is the mean-anomaly period, the Moon's
    // P=27.322 d is the SIDEREAL month (the anomalistic month is 27.5545 d), so
    // it converts through the sidereal variant: 2π/P is the mean-LONGITUDE
    // rate, and dM/dt is that minus both precession rates. Reading 27.322 d as
    // the M-period would double-count the apsidal advance into longitude —
    // +0.111°/day = 40.6°/yr of phase drift, a Moon 102° off the Sun at the
    // real 2024-04-08 eclipse (see the eclipse regression test). Papsis is the
    // ARGUMENT-of-periapsis period (ω relative to the regressing node):
    // 5.997 yr is consistent with the famous 8.85 yr perigee (longitude ϖ) and
    // 18.6 yr node — 360/(360/8.85 + 360/18.6) = 5.997. Prograde: apsis
    // advances (+), node regresses (−). Ecliptic-framed, so `plane` is omitted.
    id: 'moon',
    focusId: 'earth',
    semiMajorMpc: 384400 * SCALE_UNITS.KM_TO_MPC,
    eccentricity: 0.0554,
    inclinationRad: degToRad(5.16),
    ascendingNodeRad: degToRad(125.08),
    argPeriapsisRad: degToRad(318.15),
    meanAnomalyRad: degToRad(135.27),
    ...moonRatesFromSiderealPeriods({
      siderealPeriodDays: 27.322,
      apsidalPrecessionYears: 5.997,
      nodalPrecessionYears: 18.6,
    }),
    color: MOON_GREY,
  },

  // Mars' moons. JPL sats/elem (Laplace frame, epoch 2000-01-01.5 TDB). Columns
  // transcribed verbatim: a(km) e ω° M° i° node° P(d) Papsis(yr) Pnode(yr),
  // pole RA/Dec (tilt of Laplace plane off the equator).
  satellite({
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
    apsidalPrecessionYears: 1.1,
    nodalPrecessionYears: 2.3,
    poleRaDeg: 317.7,
    poleDecDeg: 52.9,
    color: SAT_ROCK,
  }),
  satellite({
    // Deimos: a=23457 e=0.000 ω=0.0 M=205.0 i=1.8 node=54.3 P=1.2625
    // Papsis=0.0 Pnode=56.2; pole RA=316.6 Dec=53.5 (tilt 0.9°). Prograde.
    // Papsis=0.0 (circular orbit → apsis undefined) ⇒ ω-rate frozen to 0.
    id: 'deimos',
    focusId: 'mars',
    semiMajorKm: 23457,
    eccentricity: 0.0,
    inclinationDeg: 1.8,
    ascendingNodeDeg: 54.3,
    argPeriapsisDeg: 0.0,
    meanAnomalyDeg: 205.0,
    periodDays: 1.2625,
    apsidalPrecessionYears: 0.0,
    nodalPrecessionYears: 56.2,
    poleRaDeg: 316.6,
    poleDecDeg: 53.5,
    color: SAT_ROCK,
  }),

  // Jupiter's Galilean moons. JPL sats/elem (Laplace frame, epoch 2000-01-01.5
  // TDB, JUP365). Columns verbatim: a(km) e ω° M° i° node° P(d) Papsis(yr)
  // Pnode(yr), pole RA/Dec. P is the anomalistic mean-motion period — for the
  // fast-precessing inner pair it is ~0.4% shorter than the sidereal period.
  satellite({
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
    apsidalPrecessionYears: 1.333,
    nodalPrecessionYears: 0.0,
    poleRaDeg: 268.1,
    poleDecDeg: 64.5,
    color: IO_SULFUR,
  }),
  satellite({
    // Europa: a=671100 e=0.009 ω=45.0 M=345.4 i=0.5 node=184.0 P=3.525463
    // Papsis=1.394 Pnode=30.202; pole RA=268.1 Dec=64.5 (tilt 0.0°). Prograde.
    id: 'europa',
    focusId: 'jupiter',
    semiMajorKm: 671100,
    eccentricity: 0.009,
    inclinationDeg: 0.5,
    ascendingNodeDeg: 184.0,
    argPeriapsisDeg: 45.0,
    meanAnomalyDeg: 345.4,
    periodDays: 3.525463,
    apsidalPrecessionYears: 1.394,
    nodalPrecessionYears: 30.202,
    poleRaDeg: 268.1,
    poleDecDeg: 64.5,
    color: SAT_ICE,
  }),
  satellite({
    // Ganymede: a=1070400 e=0.001 ω=198.3 M=324.8 i=0.2 node=58.5 P=7.155588
    // Papsis=68.301 Pnode=137.812; pole RA=268.2 Dec=64.6 (tilt 0.1°). Prograde.
    id: 'ganymede',
    focusId: 'jupiter',
    semiMajorKm: 1070400,
    eccentricity: 0.001,
    inclinationDeg: 0.2,
    ascendingNodeDeg: 58.5,
    argPeriapsisDeg: 198.3,
    meanAnomalyDeg: 324.8,
    periodDays: 7.155588,
    apsidalPrecessionYears: 68.301,
    nodalPrecessionYears: 137.812,
    poleRaDeg: 268.2,
    poleDecDeg: 64.6,
    color: SAT_ROCK,
  }),
  satellite({
    // Callisto: a=1882700 e=0.007 ω=43.8 M=87.4 i=0.3 node=309.1 P=16.690440
    // Papsis=277.921 Pnode=577.264; pole RA=268.7 Dec=64.8 (tilt 0.4°). Prograde.
    id: 'callisto',
    focusId: 'jupiter',
    semiMajorKm: 1882700,
    eccentricity: 0.007,
    inclinationDeg: 0.3,
    ascendingNodeDeg: 309.1,
    argPeriapsisDeg: 43.8,
    meanAnomalyDeg: 87.4,
    periodDays: 16.69044,
    apsidalPrecessionYears: 277.921,
    nodalPrecessionYears: 577.264,
    poleRaDeg: 268.7,
    poleDecDeg: 64.8,
    color: SAT_ROCK,
  }),

  // Saturn's major moons. JPL sats/elem (Laplace frame, epoch 2000-01-01.5 TDB,
  // SAT441). Columns verbatim: a(km) e ω° M° i° node° P(d) Papsis(yr) Pnode(yr),
  // pole RA/Dec. The inner moons share Saturn's pole (RA≈40.6 Dec≈83.5, tilt≈0);
  // Iapetus sits far enough out that its Laplace plane tilts 14.8° off the
  // equator, so its own pole (RA=288.7 Dec=78.9) and i=7.6° carry that truthfully
  // — the trail no longer laid on Saturn's equator.
  satellite({
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
    apsidalPrecessionYears: 0.493,
    nodalPrecessionYears: 0.986,
    poleRaDeg: 40.6,
    poleDecDeg: 83.5,
    color: SAT_ICE,
  }),
  satellite({
    // Enceladus: a=238400 e=0.005 ω=119.5 M=57.0 i=0.0 node=0.0 P=1.370218
    // Papsis=2.916 Pnode=0.000; pole RA=40.6 Dec=83.5 (tilt 0.0°). Prograde.
    // i≈0 ⇒ node undefined, Pnode=0.000 ⇒ Ω-rate frozen to 0.
    id: 'enceladus',
    focusId: 'saturn',
    semiMajorKm: 238400,
    eccentricity: 0.005,
    inclinationDeg: 0.0,
    ascendingNodeDeg: 0.0,
    argPeriapsisDeg: 119.5,
    meanAnomalyDeg: 57.0,
    periodDays: 1.370218,
    apsidalPrecessionYears: 2.916,
    nodalPrecessionYears: 0.0,
    poleRaDeg: 40.6,
    poleDecDeg: 83.5,
    color: SAT_ICE,
  }),
  satellite({
    // Tethys: a=295000 e=0.001 ω=335.3 M=0.0 i=1.1 node=273.0 P=1.887802
    // Papsis=0.005 Pnode=4.982; pole RA=40.6 Dec=83.5 (tilt 0.0°). Prograde.
    // Papsis=0.005 yr is a near-circular-orbit table artifact (72000°/yr taken
    // literally) ⇒ ω-rate frozen to 0 (degenerate periapsis; error ≤ e·a).
    id: 'tethys',
    focusId: 'saturn',
    semiMajorKm: 295000,
    eccentricity: 0.001,
    inclinationDeg: 1.1,
    ascendingNodeDeg: 273.0,
    argPeriapsisDeg: 335.3,
    meanAnomalyDeg: 0.0,
    periodDays: 1.887802,
    apsidalPrecessionYears: 0.005,
    nodalPrecessionYears: 4.982,
    poleRaDeg: 40.6,
    poleDecDeg: 83.5,
    color: SAT_ICE,
  }),
  satellite({
    // Dione: a=377700 e=0.002 ω=116.0 M=212.0 i=0.0 node=0.0 P=2.736916
    // Papsis=11.698 Pnode=0.000; pole RA=40.6 Dec=83.5 (tilt 0.0°). Prograde.
    // i≈0 ⇒ node undefined, Pnode=0.000 ⇒ Ω-rate frozen to 0.
    id: 'dione',
    focusId: 'saturn',
    semiMajorKm: 377700,
    eccentricity: 0.002,
    inclinationDeg: 0.0,
    ascendingNodeDeg: 0.0,
    argPeriapsisDeg: 116.0,
    meanAnomalyDeg: 212.0,
    periodDays: 2.736916,
    apsidalPrecessionYears: 11.698,
    nodalPrecessionYears: 0.0,
    poleRaDeg: 40.6,
    poleDecDeg: 83.5,
    color: SAT_ICE,
  }),
  satellite({
    // Rhea: a=527200 e=0.001 ω=44.3 M=31.5 i=0.3 node=133.7 P=4.517503
    // Papsis=33.939 Pnode=35.775; pole RA=40.6 Dec=83.5 (tilt 0.0°). Prograde.
    id: 'rhea',
    focusId: 'saturn',
    semiMajorKm: 527200,
    eccentricity: 0.001,
    inclinationDeg: 0.3,
    ascendingNodeDeg: 133.7,
    argPeriapsisDeg: 44.3,
    meanAnomalyDeg: 31.5,
    periodDays: 4.517503,
    apsidalPrecessionYears: 33.939,
    nodalPrecessionYears: 35.775,
    poleRaDeg: 40.6,
    poleDecDeg: 83.5,
    color: SAT_ICE,
  }),
  satellite({
    // Titan: a=1221900 e=0.029 ω=78.3 M=11.7 i=0.3 node=78.6 P=15.945448
    // Papsis=346.680 Pnode=687.370; pole RA=36.4 Dec=84.0 (tilt 0.6°). Prograde.
    id: 'titan',
    focusId: 'saturn',
    semiMajorKm: 1221900,
    eccentricity: 0.029,
    inclinationDeg: 0.3,
    ascendingNodeDeg: 78.6,
    argPeriapsisDeg: 78.3,
    meanAnomalyDeg: 11.7,
    periodDays: 15.945448,
    apsidalPrecessionYears: 346.68,
    nodalPrecessionYears: 687.37,
    poleRaDeg: 36.4,
    poleDecDeg: 84.0,
    color: TITAN_ORANGE,
  }),
  satellite({
    // Iapetus: a=3561700 e=0.028 ω=254.5 M=74.8 i=7.6 node=86.5 P=79.331002
    // Papsis=1662.900 Pnode=3130.302; pole RA=288.7 Dec=78.9 (tilt 14.8° — its
    // Laplace plane is pulled well off Saturn's equator, so it rides its OWN
    // pole, and i is 7.6° relative to THAT plane). Prograde.
    id: 'iapetus',
    focusId: 'saturn',
    semiMajorKm: 3561700,
    eccentricity: 0.028,
    inclinationDeg: 7.6,
    ascendingNodeDeg: 86.5,
    argPeriapsisDeg: 254.5,
    meanAnomalyDeg: 74.8,
    periodDays: 79.331002,
    apsidalPrecessionYears: 1662.9,
    nodalPrecessionYears: 3130.302,
    poleRaDeg: 288.7,
    poleDecDeg: 78.9,
    color: SAT_ROCK,
  }),
  // The 39 bound S-stars arrive mapped rather than written out: one publication,
  // one uniform row shape, so the per-row facts stay in `sStarElements.ts` beside
  // their verbatim Gillessen lines and the conversions stay in the `sStar` maker.
  // Spelling them here would repeat that maker 39 times. Their focus is
  // `sgr-a-star`, so they join the `galactic-centre` region by existing.
  ...S_STAR_SEEDS.map(sStar),
];
