/**
 * rotationElements — the IAU/WGCCRE J2000 rotation-element table: each textured
 * body's north-pole direction (RA/Dec) and prime-meridian angle W₀, the facing
 * counterpart to `orbitalElements` (which places a body, this one aims it).
 *
 * ### Why only the textured bodies
 *
 * Orientation only matters where a texture rides the surface: a flat-albedo or
 * emissive sphere is rotation-invariant, so the Sun, the irregular moons, and
 * Titan carry no row here and fall back to `IDENTITY_MAT3`. The fifteen rows
 * are exactly the textured set (spec §3): the eight major planets, the Moon,
 * Jupiter's four Galilean moons, and Pluto + Charon.
 *
 * ### The spin rate Ẇ is live; the pole rates are not
 *
 * The published elements are of the form `α₀ + α̇·T`, `δ₀ + δ̇·T`, and
 * `W₀ + Ẇ·d`, several of them carrying additional periodic nutation/libration
 * terms (Neptune's `N`, the Moon's `E1…`, the Galileans' `Jn`). The
 * prime-meridian spin `Ẇ` is authored per row (`spinRateDegPerDay`) and drives
 * each body's live meridian as the scene clock advances — a visibly rotating
 * planet. The pole rates `α̇`/`δ̇` and the periodic corrections stay dropped: they
 * move the pole by under an arcminute over 250 years, below a textured sphere's
 * resolution, so the constant α₀/δ₀ pole is authored and only W turns.
 *
 * ### Saturn's pole is shared, not re-authored loosely
 *
 * Saturn's `(α=40.589°, δ=83.537°)` is deliberately the SAME pole
 * `SATURN_EQUATORIAL_FRAME` (`orbitPlaneFrames.ts`) is built from, so Saturn's
 * texture, its rings, and its regular moons all ride one equatorial frame. The
 * two tables author the pole independently (this one as rotation elements, that
 * one as a plane normal); `rotationElements.test.ts` pins them equal so a retune
 * of one without the other fails loudly.
 *
 * ### Provenance
 *
 * Archinal, B. A., et al. (2018), "Report of the IAU Working Group on
 * Cartographic Coordinates and Rotational Elements: 2015", Celestial Mechanics
 * and Dynamical Astronomy 130:22. Values are the constant α₀/δ₀/W₀ terms of that
 * report's Tables 1 (planets) and 2/3 (satellites). Uranus's declination is
 * genuinely negative (δ₀ = −15.175°): the IAU north pole is defined by the
 * invariable-plane convention, which for retrograde-rotating Uranus points south
 * of the ecliptic — authored as published, not sign-flipped.
 */

import { findByIdOrThrow } from '../../utils/object/findByIdOrThrow';
import type { RotationElements } from '../../@types/scene/RotationElements';

/**
 * Look up a body's IAU rotation elements by id — the domain wrapper the body
 * makers bake orientations through (`rotationFromIau(rotationById(id))`). The
 * find-over-a-table lives with its table, mirroring `elementsById`; the
 * throw-on-miss (via `findByIdOrThrow`) fires at bake time so a typo fails
 * loudly rather than silently orienting a body from `undefined`/NaN.
 */
export function rotationById(id: string): RotationElements {
  return findByIdOrThrow(ROTATION_ELEMENTS, id, 'rotationElements');
}

/**
 * The fifteen textured bodies, in the same outward order as `orbitalElements`:
 * the eight major planets (Mercury → Neptune), Earth's Moon, Jupiter's four
 * Galilean moons, then Pluto and Charon. Each row carries the J2000 pole (α₀, δ₀),
 * the epoch meridian W₀, and its spin rate Ẇ; degrees at the seed site (matching
 * the report's tables), composed into a `Mat3` per instant via `rotationFromIau`.
 */
export const ROTATION_ELEMENTS: readonly RotationElements[] = [
  // Mercury. WGCCRE-2015 Table 1: α₀ = 281.0103 − 0.0328T, δ₀ = 61.4155 − 0.0049T,
  // W = 329.5988 + 6.1385108·d (+ periodic Mn terms).
  { id: 'mercury', poleRaDeg: 281.0103, poleDecDeg: 61.4155, primeMeridianDeg: 329.5988, spinRateDegPerDay: 6.1385108 },
  // Venus (retrograde). α₀ = 272.76, δ₀ = 67.16, W = 160.20 − 1.4813688·d.
  { id: 'venus', poleRaDeg: 272.76, poleDecDeg: 67.16, primeMeridianDeg: 160.2, spinRateDegPerDay: -1.4813688 },
  // Earth. α₀ = 0.00 − 0.641T, δ₀ = 90.00 − 0.557T, W = 190.147 + 360.9856235·d.
  { id: 'earth', poleRaDeg: 0.0, poleDecDeg: 90.0, primeMeridianDeg: 190.147, spinRateDegPerDay: 360.9856235 },
  // Mars. α₀ = 317.68143 − 0.1061T, δ₀ = 52.88650 − 0.0609T,
  // W = 176.630 + 350.89198226·d. (orbitPlaneFrames rounds the pole to 317.681/52.887.)
  { id: 'mars', poleRaDeg: 317.68143, poleDecDeg: 52.8865, primeMeridianDeg: 176.63, spinRateDegPerDay: 350.89198226 },
  // Jupiter. α₀ = 268.056595 − 0.006499T (+ periodic Ja terms),
  // δ₀ = 64.495303 + 0.002413T (+ periodic), W = 284.95 + 870.5360000·d.
  { id: 'jupiter', poleRaDeg: 268.056595, poleDecDeg: 64.495303, primeMeridianDeg: 284.95, spinRateDegPerDay: 870.536 },
  // Saturn. α₀ = 40.589 − 0.036T, δ₀ = 83.537 − 0.004T, W = 38.90 + 810.7939024·d.
  // The pole MUST equal SATURN_EQUATORIAL_FRAME's (the rings share Saturn's
  // equatorial frame; the moons derive their orbit planes from their own Laplace poles).
  { id: 'saturn', poleRaDeg: 40.589, poleDecDeg: 83.537, primeMeridianDeg: 38.9, spinRateDegPerDay: 810.7939024 },
  // Uranus (retrograde; IAU north pole points south of the ecliptic — δ₀ < 0).
  // α₀ = 257.311, δ₀ = −15.175, W = 203.81 − 501.1600928·d.
  { id: 'uranus', poleRaDeg: 257.311, poleDecDeg: -15.175, primeMeridianDeg: 203.81, spinRateDegPerDay: -501.1600928 },
  // Neptune. α₀ = 299.36 + 0.70·sin N, δ₀ = 43.46 − 0.51·cos N,
  // W = 249.978 + 541.1397757·d − 0.48·sin N. Constant terms only (N-periodic dropped).
  { id: 'neptune', poleRaDeg: 299.36, poleDecDeg: 43.46, primeMeridianDeg: 249.978, spinRateDegPerDay: 541.1397757 },
  // The Moon. WGCCRE-2015 Table 2 (constant terms; the E1…E13 libration series
  // dropped): α₀ = 269.9949 + 0.0031T − …, δ₀ = 66.5392 + 0.0130T + …,
  // W = 38.3213 + 13.17635815·d − ….
  { id: 'moon', poleRaDeg: 269.9949, poleDecDeg: 66.5392, primeMeridianDeg: 38.3213, spinRateDegPerDay: 13.17635815 },
  // Io. α₀ = 268.05 − 0.009T (+ Jn periodic), δ₀ = 64.50 + 0.003T (+ periodic),
  // W = 200.39 + 203.4889538·d − ….
  { id: 'io', poleRaDeg: 268.05, poleDecDeg: 64.5, primeMeridianDeg: 200.39, spinRateDegPerDay: 203.4889538 },
  // Europa. α₀ = 268.08 − 0.009T (+ periodic), δ₀ = 64.51 + 0.003T (+ periodic),
  // W = 36.022 + 101.3747235·d − ….
  { id: 'europa', poleRaDeg: 268.08, poleDecDeg: 64.51, primeMeridianDeg: 36.022, spinRateDegPerDay: 101.3747235 },
  // Ganymede. α₀ = 268.20 − 0.009T (+ periodic), δ₀ = 64.57 + 0.003T (+ periodic),
  // W = 44.064 + 50.3176081·d − ….
  { id: 'ganymede', poleRaDeg: 268.2, poleDecDeg: 64.57, primeMeridianDeg: 44.064, spinRateDegPerDay: 50.3176081 },
  // Callisto. α₀ = 268.72 − 0.009T (+ periodic), δ₀ = 64.83 + 0.003T (+ periodic),
  // W = 259.51 + 21.5710715·d − ….
  { id: 'callisto', poleRaDeg: 268.72, poleDecDeg: 64.83, primeMeridianDeg: 259.51, spinRateDegPerDay: 21.5710715 },
  // Pluto (NAIF pck00011.tpc BODY999). α₀ = 132.993, δ₀ = −6.163, W = 302.695 + 56.3625225·d.
  // Minor-body pole convention: the "positive" pole, so Ẇ is positive despite the retrograde
  // spin — unlike Uranus/Venus above, which keep the planet convention and go negative.
  { id: 'pluto', poleRaDeg: 132.993, poleDecDeg: -6.163, primeMeridianDeg: 302.695, spinRateDegPerDay: 56.3625225 },
  // Charon (pck00011.tpc BODY901). W = 122.695 + 56.3625225·d. LANDMINE — what this row shares
  // with Pluto's is physics, not copy-paste: mutual tidal lock means one spin axis (identical
  // pole), each prime meridian is the sub-companion one (W₀ exactly 180° apart), and rotation
  // and orbit are one quantity measured twice (Ẇ = 360°/6.387222 d, Charon's orbital period in
  // `orbitalElements.ts`; 56.3625225 × 6.387222 = 359.99994°, residual from their rounding).
  { id: 'charon', poleRaDeg: 132.993, poleDecDeg: -6.163, primeMeridianDeg: 122.695, spinRateDegPerDay: 56.3625225 },
];
