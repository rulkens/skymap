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
 * ### Frames
 *
 * Every solar-system body orbits near the **ecliptic**, so all elements are
 * referenced to the ecliptic J2000 frame; the ecliptic→equatorial rotation into
 * the scene's frame is `ECLIPTIC_BASIS`, applied downstream where the ellipse is
 * built. The eight major planets (Mercury through Neptune, Earth as the EMB) are
 * **heliocentric** — `parentId: null`, focus at the Sun (the render origin). The
 * Moon's elements are **geocentric** — `parentId: 'earth'`, so its focus
 * resolves to Earth's own derived world position and its trail follows Earth by
 * construction.
 *
 * The scene is static at a single epoch (J2000, no clock), so only the epoch
 * column of the mean elements is stored; JPL's element rates are recorded in the
 * spec for provenance but deliberately omitted here (YAGNI — a future animated
 * ephemeris is the named extension point).
 *
 * ### Authoring discipline
 *
 * No buried Mpc / radian literals: every distance is `<human value> *
 * SCALE_UNITS.…` (au / km → Mpc) and every angle is `<deg> * DEG_TO_RAD`, the
 * same discipline `sceneBodies.ts` observes. JPL tabulates the planets by mean
 * longitude `L` and longitude of perihelion `ϖ`; the classical `ω` and `M` are
 * derived at the seed site via `ω = ϖ − Ω` and `M = L − ϖ`, with that
 * arithmetic written out inline so the transcription stays checkable.
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
import type { OrbitalElements } from '../../@types/scene/OrbitalElements';
import type { Vec3 } from '../../@types/math/Vec3';

// Degrees → radians. A one-line local rather than a `src/utils/` export: this
// is the only site that needs it, and a fixed authored table does not earn a
// shared helper (same module-local status as `sceneBodies.ts`'s `star()`).
const DEG_TO_RAD = Math.PI / 180;

// Dim, distinct linear-RGB trail tints (max channel ≲ 0.5 for the additive HDR
// draw): one per body, chosen to read apart at a glance — warm greys and golds
// for the rocky/gas giants, cool blues for the ice giants and Earth.
const MERCURY_GREY: Vec3 = [0.42, 0.4, 0.36];
const VENUS_CREAM: Vec3 = [0.5, 0.47, 0.33];
const EARTH_BLUE: Vec3 = [0.15, 0.25, 0.5];
const MARS_RED: Vec3 = [0.5, 0.2, 0.12];
const JUPITER_TAN: Vec3 = [0.5, 0.38, 0.2];
const SATURN_GOLD: Vec3 = [0.5, 0.43, 0.25];
const URANUS_CYAN: Vec3 = [0.3, 0.47, 0.5];
const NEPTUNE_BLUE: Vec3 = [0.2, 0.3, 0.55];
const MOON_GREY: Vec3 = [0.35, 0.35, 0.4];

/**
 * The guidance orbits: the eight major planets (heliocentric, in order outward
 * from the Sun) plus the Moon (geocentric). Columns are authored in the units
 * JPL publishes (au / km, degrees) and converted at the seed site; `ω` and `M`
 * show their `ϖ`/`L`/`Ω` derivation inline.
 */
export const ORBITAL_ELEMENTS: readonly OrbitalElements[] = [
  {
    // Mercury, heliocentric. JPL: L = 252.25032350°, ϖ = 77.45779628°,
    // Ω = 48.33076593°.
    id: 'mercury',
    parentId: null,
    semiMajorMpc: 0.38709927 * SCALE_UNITS.AU_TO_MPC,
    eccentricity: 0.20563593,
    inclinationRad: 7.00497902 * DEG_TO_RAD,
    ascendingNodeRad: 48.33076593 * DEG_TO_RAD,
    // ω = ϖ − Ω = 77.45779628 − 48.33076593
    argPeriapsisRad: (77.45779628 - 48.33076593) * DEG_TO_RAD,
    // M = L − ϖ = 252.25032350 − 77.45779628
    meanAnomalyRad: (252.2503235 - 77.45779628) * DEG_TO_RAD,
    color: MERCURY_GREY,
  },
  {
    // Venus, heliocentric. JPL: L = 181.97909950°, ϖ = 131.60246718°,
    // Ω = 76.67984255°.
    id: 'venus',
    parentId: null,
    semiMajorMpc: 0.72333566 * SCALE_UNITS.AU_TO_MPC,
    eccentricity: 0.00677672,
    inclinationRad: 3.39467605 * DEG_TO_RAD,
    ascendingNodeRad: 76.67984255 * DEG_TO_RAD,
    // ω = ϖ − Ω = 131.60246718 − 76.67984255
    argPeriapsisRad: (131.60246718 - 76.67984255) * DEG_TO_RAD,
    // M = L − ϖ = 181.97909950 − 131.60246718
    meanAnomalyRad: (181.9790995 - 131.60246718) * DEG_TO_RAD,
    color: VENUS_CREAM,
  },
  {
    // Earth–Moon barycenter, heliocentric. JPL: L = 100.46457166°,
    // ϖ = 102.93768193°, Ω = 0.0°.
    id: 'earth',
    parentId: null,
    semiMajorMpc: 1.00000261 * SCALE_UNITS.AU_TO_MPC,
    eccentricity: 0.01671123,
    inclinationRad: -0.00001531 * DEG_TO_RAD,
    ascendingNodeRad: 0.0 * DEG_TO_RAD,
    // ω = ϖ − Ω = 102.93768193 − 0.0
    argPeriapsisRad: (102.93768193 - 0.0) * DEG_TO_RAD,
    // M = L − ϖ = 100.46457166 − 102.93768193
    meanAnomalyRad: (100.46457166 - 102.93768193) * DEG_TO_RAD,
    color: EARTH_BLUE,
  },
  {
    // Mars, heliocentric. JPL: L = −4.55343205°, ϖ = −23.94362959°,
    // Ω = 49.55953891°.
    id: 'mars',
    parentId: null,
    semiMajorMpc: 1.52371034 * SCALE_UNITS.AU_TO_MPC,
    eccentricity: 0.0933941,
    inclinationRad: 1.84969142 * DEG_TO_RAD,
    ascendingNodeRad: 49.55953891 * DEG_TO_RAD,
    // ω = ϖ − Ω = −23.94362959 − 49.55953891
    argPeriapsisRad: (-23.94362959 - 49.55953891) * DEG_TO_RAD,
    // M = L − ϖ = −4.55343205 − (−23.94362959)
    meanAnomalyRad: (-4.55343205 - -23.94362959) * DEG_TO_RAD,
    color: MARS_RED,
  },
  {
    // Jupiter, heliocentric. JPL: L = 34.39644051°, ϖ = 14.72847983°,
    // Ω = 100.47390909°.
    id: 'jupiter',
    parentId: null,
    semiMajorMpc: 5.202887 * SCALE_UNITS.AU_TO_MPC,
    eccentricity: 0.04838624,
    inclinationRad: 1.30439695 * DEG_TO_RAD,
    ascendingNodeRad: 100.47390909 * DEG_TO_RAD,
    // ω = ϖ − Ω = 14.72847983 − 100.47390909
    argPeriapsisRad: (14.72847983 - 100.47390909) * DEG_TO_RAD,
    // M = L − ϖ = 34.39644051 − 14.72847983
    meanAnomalyRad: (34.39644051 - 14.72847983) * DEG_TO_RAD,
    color: JUPITER_TAN,
  },
  {
    // Saturn, heliocentric. JPL: L = 49.95424423°, ϖ = 92.59887831°,
    // Ω = 113.66242448°.
    id: 'saturn',
    parentId: null,
    semiMajorMpc: 9.53667594 * SCALE_UNITS.AU_TO_MPC,
    eccentricity: 0.05386179,
    inclinationRad: 2.48599187 * DEG_TO_RAD,
    ascendingNodeRad: 113.66242448 * DEG_TO_RAD,
    // ω = ϖ − Ω = 92.59887831 − 113.66242448
    argPeriapsisRad: (92.59887831 - 113.66242448) * DEG_TO_RAD,
    // M = L − ϖ = 49.95424423 − 92.59887831
    meanAnomalyRad: (49.95424423 - 92.59887831) * DEG_TO_RAD,
    color: SATURN_GOLD,
  },
  {
    // Uranus, heliocentric. JPL: L = 313.23810451°, ϖ = 170.95427630°,
    // Ω = 74.01692503°.
    id: 'uranus',
    parentId: null,
    semiMajorMpc: 19.18916464 * SCALE_UNITS.AU_TO_MPC,
    eccentricity: 0.04725744,
    inclinationRad: 0.77263783 * DEG_TO_RAD,
    ascendingNodeRad: 74.01692503 * DEG_TO_RAD,
    // ω = ϖ − Ω = 170.95427630 − 74.01692503
    argPeriapsisRad: (170.9542763 - 74.01692503) * DEG_TO_RAD,
    // M = L − ϖ = 313.23810451 − 170.95427630
    meanAnomalyRad: (313.23810451 - 170.9542763) * DEG_TO_RAD,
    color: URANUS_CYAN,
  },
  {
    // Neptune, heliocentric. JPL: L = −55.12002969°, ϖ = 44.96476227°,
    // Ω = 131.78422574°.
    id: 'neptune',
    parentId: null,
    semiMajorMpc: 30.06992276 * SCALE_UNITS.AU_TO_MPC,
    eccentricity: 0.00859048,
    inclinationRad: 1.77004347 * DEG_TO_RAD,
    ascendingNodeRad: 131.78422574 * DEG_TO_RAD,
    // ω = ϖ − Ω = 44.96476227 − 131.78422574
    argPeriapsisRad: (44.96476227 - 131.78422574) * DEG_TO_RAD,
    // M = L − ϖ = −55.12002969 − 44.96476227
    meanAnomalyRad: (-55.12002969 - 44.96476227) * DEG_TO_RAD,
    color: NEPTUNE_BLUE,
  },
  {
    // The Moon, geocentric — its focus is Earth's derived position. JPL gives ω
    // and M directly (no ϖ/L derivation needed) for the satellite mean elements.
    id: 'moon',
    parentId: 'earth',
    semiMajorMpc: 384400 * SCALE_UNITS.KM_TO_MPC,
    eccentricity: 0.0554,
    inclinationRad: 5.16 * DEG_TO_RAD,
    ascendingNodeRad: 125.08 * DEG_TO_RAD,
    argPeriapsisRad: 318.15 * DEG_TO_RAD,
    meanAnomalyRad: 135.27 * DEG_TO_RAD,
    color: MOON_GREY,
  },
];
