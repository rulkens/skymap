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
 * - **Focus** (`parentId`): the eight major planets (Mercury through Neptune,
 *   Earth as the EMB) are **heliocentric** — `parentId: null`, focus at the Sun
 *   (the render origin). A moon is **geocentric** to its planet — `parentId`
 *   names it — so its focus resolves to that planet's own derived world position
 *   and its trail follows the planet by construction.
 * - **Reference plane** (`plane`, see `orbitPlaneFrames.ts`): the planets AND
 *   Earth's Moon are referenced to the **ecliptic** (JPL publishes them there),
 *   the default when `plane` is omitted. But a planet's OWN moons are referenced
 *   to that planet's **equatorial (Laplace) plane** — Saturn's is tilted ~27° to
 *   the ecliptic, which is why its regular moons ride visibly tilted — so each
 *   satellite row carries an explicit `plane` (`{MARS,JUPITER,SATURN}_EQUATORIAL_FRAME`).
 *   The ecliptic→equatorial rotation into the scene's frame is `ECLIPTIC_FRAME`
 *   (see `orbitPlaneFrames.ts`), applied downstream where the ellipse is built.
 *
 * Each planet row carries its J2000 epoch elements AND the six per-Julian-
 * century rates from the same JPL table, so `propagateElements` can advance the
 * body to any simulated instant. The Moon and the satellite rows carry epoch
 * elements only (their rates are a Task-5 concern); a row with no rates
 * propagates to itself, so the mixed table stays uniform.
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
 * - Moon: JPL SSD "Planetary Satellite Mean Orbital Parameters" (ecliptic,
 *   epoch J2000, DE405/LE405 fit). These describe a precessing mean ellipse —
 *   exactly, and only, what a guidance trail needs.
 *   https://ssd.jpl.nasa.gov/sats/elem/
 */

import { SCALE_UNITS } from '../scaleUnits';
import {
  MARS_EQUATORIAL_FRAME,
  JUPITER_EQUATORIAL_FRAME,
  SATURN_EQUATORIAL_FRAME,
} from './orbitPlaneFrames';
import { satellite } from './makers/satellite';
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
 * major moons (geocentric, in that planet's equatorial `plane` — see
 * `satellite`). Planet columns are authored in the units JPL publishes (au /
 * km, degrees) and converted at the seed site; `ω` and `M` show their `ϖ`/`L`/`Ω`
 * derivation inline. Moon rows go through `satellite` (angular phase not
 * modelled — the trail's size and tilt are what matter).
 */
export const ORBITAL_ELEMENTS: readonly OrbitalElements[] = [
  {
    // Mercury, heliocentric. JPL: L = 252.25032350°, ϖ = 77.45779628°,
    // Ω = 48.33076593°.
    id: 'mercury',
    parentId: null,
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
    parentId: null,
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
    parentId: null,
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
    parentId: null,
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
    parentId: null,
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
    parentId: null,
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
    parentId: null,
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
    parentId: null,
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
    // The Moon, geocentric — its focus is Earth's derived position. JPL gives ω
    // and M directly (no ϖ/L derivation needed) for the satellite mean elements.
    id: 'moon',
    parentId: 'earth',
    semiMajorMpc: 384400 * SCALE_UNITS.KM_TO_MPC,
    eccentricity: 0.0554,
    inclinationRad: degToRad(5.16),
    ascendingNodeRad: degToRad(125.08),
    argPeriapsisRad: degToRad(318.15),
    meanAnomalyRad: degToRad(135.27),
    color: MOON_GREY,
  },

  // Mars' moons (semi-major km, e, inclination° to Mars' equator).
  satellite({
    id: 'phobos',
    parentId: 'mars',
    plane: MARS_EQUATORIAL_FRAME,
    semiMajorKm: 9376,
    eccentricity: 0.0151,
    inclinationDeg: 1.08,
    color: SAT_ROCK,
  }),
  satellite({
    id: 'deimos',
    parentId: 'mars',
    plane: MARS_EQUATORIAL_FRAME,
    semiMajorKm: 23463,
    eccentricity: 0.00033,
    inclinationDeg: 1.79,
    color: SAT_ROCK,
  }),

  // Jupiter's Galilean moons (inclination° to Jupiter's equator).
  satellite({
    id: 'io',
    parentId: 'jupiter',
    plane: JUPITER_EQUATORIAL_FRAME,
    semiMajorKm: 421800,
    eccentricity: 0.0041,
    inclinationDeg: 0.036,
    color: IO_SULFUR,
  }),
  satellite({
    id: 'europa',
    parentId: 'jupiter',
    plane: JUPITER_EQUATORIAL_FRAME,
    semiMajorKm: 671100,
    eccentricity: 0.0094,
    inclinationDeg: 0.466,
    color: SAT_ICE,
  }),
  satellite({
    id: 'ganymede',
    parentId: 'jupiter',
    plane: JUPITER_EQUATORIAL_FRAME,
    semiMajorKm: 1070400,
    eccentricity: 0.0013,
    inclinationDeg: 0.177,
    color: SAT_ROCK,
  }),
  satellite({
    id: 'callisto',
    parentId: 'jupiter',
    plane: JUPITER_EQUATORIAL_FRAME,
    semiMajorKm: 1882700,
    eccentricity: 0.0074,
    inclinationDeg: 0.192,
    color: SAT_ROCK,
  }),

  // Saturn's major moons (inclination° to Saturn's equator; Iapetus rides ~15° out).
  satellite({
    id: 'mimas',
    parentId: 'saturn',
    plane: SATURN_EQUATORIAL_FRAME,
    semiMajorKm: 185540,
    eccentricity: 0.0196,
    inclinationDeg: 1.574,
    color: SAT_ICE,
  }),
  satellite({
    id: 'enceladus',
    parentId: 'saturn',
    plane: SATURN_EQUATORIAL_FRAME,
    semiMajorKm: 238040,
    eccentricity: 0.0047,
    inclinationDeg: 0.009,
    color: SAT_ICE,
  }),
  satellite({
    id: 'tethys',
    parentId: 'saturn',
    plane: SATURN_EQUATORIAL_FRAME,
    semiMajorKm: 294670,
    eccentricity: 0.0001,
    inclinationDeg: 1.091,
    color: SAT_ICE,
  }),
  satellite({
    id: 'dione',
    parentId: 'saturn',
    plane: SATURN_EQUATORIAL_FRAME,
    semiMajorKm: 377420,
    eccentricity: 0.0022,
    inclinationDeg: 0.028,
    color: SAT_ICE,
  }),
  satellite({
    id: 'rhea',
    parentId: 'saturn',
    plane: SATURN_EQUATORIAL_FRAME,
    semiMajorKm: 527070,
    eccentricity: 0.001,
    inclinationDeg: 0.345,
    color: SAT_ICE,
  }),
  satellite({
    id: 'titan',
    parentId: 'saturn',
    plane: SATURN_EQUATORIAL_FRAME,
    semiMajorKm: 1221870,
    eccentricity: 0.0288,
    inclinationDeg: 0.348,
    color: TITAN_ORANGE,
  }),
  satellite({
    id: 'iapetus',
    parentId: 'saturn',
    plane: SATURN_EQUATORIAL_FRAME,
    semiMajorKm: 3560840,
    eccentricity: 0.0286,
    inclinationDeg: 15.47,
    color: SAT_ROCK,
  }),
];
