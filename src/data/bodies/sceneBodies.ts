/**
 * sceneBodies — authored seeds for the scene's true-scale foreground bodies.
 *
 * These are data, not runtime state: constants the descent renders against
 * once the zoom reaches the local (sub-kiloparsec) neighbourhood. Positions
 * are authored in the units a human reads them in — Earth "1 AU from the
 * Sun", a star "RA/Dec at so many parsecs" — and stored canonically in
 * Megaparsecs via `SCALE_UNITS`, the same absolute heliocentric frame every
 * catalogue position lives in. Keeping the conversion explicit (never an
 * inline magic Mpc number) means the physical relationship stays legible at
 * the seed site, and every position speaks the one draw-space language the
 * renderer expects.
 *
 * Star positions go through `raDecDistToCartesian` — the SAME right-handed
 * equatorial J2000 spherical→Cartesian conversion the galaxy build pipeline
 * uses — so the seeded neighbourhood is NOT rotated against the real sky the
 * catalogues paint. Hand-authored bare-xyz constants or an inlined formula
 * would silently break that alignment; the RA/Dec authoring is the contract.
 * The Sun is seeded with distPc = 0, which collapses the conversion to the
 * origin [0, 0, 0] regardless of RA/Dec — the frame is heliocentric.
 *
 * Star-selection rule: the Sun, PLUS one representative entry per stellar
 * system within ~4 pc (A/B components merged into their primary — e.g.
 * Alpha Centauri A+B as one entry — EXCEPT Proxima Centauri, kept as its own
 * entry because its ~1.301 pc distance is the parsec-scale f64 anchor the
 * tests pin), PLUS the naked-eye landmark stars out to ~10 pc (Sirius,
 * Procyon, Altair, Vega, Fomalhaut, Pollux, …).
 *
 * Provenance: RA/Dec (J2000), distances, and absolute magnitudes are standard
 * published values (Hipparcos / Gaia-era, as commonly tabulated in the
 * nearest-stars and brightest-stars compilations). Merged systems carry the
 * primary's absMag and the system position at the primary's precision.
 *
 * Colour: authored linear-RGB constants from a small per-spectral-class
 * palette (the CPU side has no B–V → RGB helper — the colour ramp lives only
 * in WGSL — and a fixed authored table does not earn one):
 *   O/B blue-white [0.6, 0.7, 1.0]   (no O/B star within 10 pc — unused here)
 *   A/F white      [1.0, 1.0, 0.98]  Sirius, Procyon, Altair, Vega, Fomalhaut
 *   G yellow-white [1.0, 0.97, 0.85] the Sun, Alpha Cen, Tau Ceti
 *   K orange       [1.0, 0.85, 0.65] Eps Eridani, 61 Cygni, Eps Indi, Pollux
 *   M red          [1.0, 0.6, 0.4]   the red dwarfs
 *
 * `radiusKm` stays in kilometres — the body's native unit — and is resolved
 * into a draw-space sphere at render time, so the authored number remains the
 * one a reader recognises (Earth's 6371 km, the Sun's 696340 km). The Sun is
 * the only star this phase resolves to a sphere; every OTHER star carries a
 * stated placeholder of one solar radius, which nothing reads until a later
 * LOD promotion — stated here rather than left silent.
 */

import { SCALE_UNITS } from '../scaleUnits';
import { RENDER_ORIGIN_MPC } from '../renderOrigin';
import { ORBITAL_ELEMENTS } from './orbitalElements';
import { keplerianPositionMpc } from '../../utils/orbit/keplerianPositionMpc';
import { raDecDistToCartesian } from '../../utils/math/raDecDistToCartesian';
import type { EarthBody } from '../../@types/scene/EarthBody';
import type { StarBody } from '../../@types/scene/StarBody';
import type { PlanetBody } from '../../@types/scene/PlanetBody';
import type { SceneBody } from '../../@types/scene/SceneBody';
import type { OrbitalElements } from '../../@types/scene/OrbitalElements';
import type { Vec3 } from '../../@types/math/Vec3';

/**
 * Look up a body's J2000 Keplerian seed in `ORBITAL_ELEMENTS` (the single
 * source of truth for both body positions and their trails). Throws on an
 * unknown id so a typo fails loudly at module load rather than silently
 * seeding a body at `undefined`/NaN. Module-local — a fixed authored table
 * does not earn a `src/utils/` export (same status as `star()` below).
 */
function elementsById(id: string): OrbitalElements {
  const found = ORBITAL_ELEMENTS.find((e) => e.id === id);
  if (!found) throw new Error(`sceneBodies: no ORBITAL_ELEMENTS entry for id '${id}'`);
  return found;
}

/**
 * Earth (strictly the Earth–Moon barycentre) at its real J2000 mean
 * heliocentric position, Earth-sized.
 *
 * DERIVED from `ORBITAL_ELEMENTS` — the single source of truth — via
 * `keplerianPositionMpc`, then anchored to the render origin (the Sun). The
 * old hand-placed '1 AU along +x' literal is gone: a placeholder position is
 * not generally *on* the Keplerian ellipse the orbit trail draws, so the
 * sphere would float off its own trail. `keplerianPositionMpc` returns a
 * focus-relative offset; adding `RENDER_ORIGIN_MPC` keeps the seed correct if
 * the heliocentric anchor ever moves (ADR-0010 extension point). Component-wise
 * because there is no vec3-add helper and the sum is only needed at seed sites.
 */
const EARTH_OFFSET_MPC = keplerianPositionMpc(elementsById('earth'));

export const SCENE_EARTH: EarthBody = {
  id: 'earth',
  label: 'Earth',
  positionMpc: [
    RENDER_ORIGIN_MPC[0] + EARTH_OFFSET_MPC[0],
    RENDER_ORIGIN_MPC[1] + EARTH_OFFSET_MPC[1],
    RENDER_ORIGIN_MPC[2] + EARTH_OFFSET_MPC[2],
  ],
  radiusKm: 6371,
  textureUrl: '/images/earth/blue-marble-4k.jpg',
};

// The spectral-class palette (linear RGB) documented in the module header.
const A_F_WHITE: Vec3 = [1.0, 1.0, 0.98];
const G_YELLOW_WHITE: Vec3 = [1.0, 0.97, 0.85];
const K_ORANGE: Vec3 = [1.0, 0.85, 0.65];
const M_RED: Vec3 = [1.0, 0.6, 0.4];

// The Sun's real radius; also the stated one-solar-radius placeholder every
// other star carries until a later LOD promotion resolves them to spheres.
const SOLAR_RADIUS_KM = 696340;

/**
 * Row maker for the star table: keeps each entry a single legible line of
 * human-unit values (J2000 RA/Dec in degrees, distance in parsecs) while the
 * Mpc conversion and the frame contract live in exactly one place. Module
 * local — a fixed authored table does not earn a `src/utils/` helper.
 */
function star(
  id: string,
  label: string,
  raDeg: number,
  decDeg: number,
  distPc: number,
  absMag: number,
  color: Vec3,
): StarBody {
  return {
    id,
    label,
    positionMpc: raDecDistToCartesian(raDeg, decDeg, distPc * SCALE_UNITS.PC_TO_MPC),
    absMag,
    color,
    radiusKm: SOLAR_RADIUS_KM,
  };
}

/**
 * The local star map, per the selection rule and provenance in the module
 * header. Columns: id, label, RA° (J2000), Dec° (J2000), distance pc, absMag,
 * spectral-class colour.
 */
export const SCENE_STARS: readonly StarBody[] = [
  star('sun', 'Sun', 0, 0, 0, 4.83, G_YELLOW_WHITE),
  star('proxima-centauri', 'Proxima Centauri', 217.4289, -62.6795, 1.301, 15.6, M_RED),
  star('alpha-centauri', 'Alpha Centauri', 219.9021, -60.8339, 1.339, 4.38, G_YELLOW_WHITE),
  star('barnards-star', "Barnard's Star", 269.4521, 4.6934, 1.834, 13.21, M_RED),
  star('wolf-359', 'Wolf 359', 164.1204, 7.0147, 2.409, 16.65, M_RED),
  star('lalande-21185', 'Lalande 21185', 165.8341, 35.9699, 2.547, 10.48, M_RED),
  star('sirius', 'Sirius', 101.2871, -16.7161, 2.64, 1.45, A_F_WHITE),
  star('luyten-726-8', 'Luyten 726-8', 24.7554, -17.9503, 2.68, 15.47, M_RED),
  star('ross-154', 'Ross 154', 282.4558, -23.8361, 2.98, 13.07, M_RED),
  star('ross-248', 'Ross 248', 355.4779, 44.175, 3.16, 14.79, M_RED),
  star('epsilon-eridani', 'Epsilon Eridani', 53.2325, -9.4583, 3.22, 6.19, K_ORANGE),
  star('lacaille-9352', 'Lacaille 9352', 346.4667, -35.8531, 3.29, 9.75, M_RED),
  star('ross-128', 'Ross 128', 176.935, 0.8044, 3.37, 13.51, M_RED),
  star('ez-aquarii', 'EZ Aquarii', 339.6392, -15.2992, 3.5, 15.33, M_RED),
  star('61-cygni', '61 Cygni', 316.7246, 38.7494, 3.5, 7.49, K_ORANGE),
  star('procyon', 'Procyon', 114.8254, 5.225, 3.51, 2.66, A_F_WHITE),
  star('struve-2398', 'Struve 2398', 280.6946, 59.6303, 3.55, 11.16, M_RED),
  star('groombridge-34', 'Groombridge 34', 4.5954, 44.0231, 3.56, 10.32, M_RED),
  star('epsilon-indi', 'Epsilon Indi', 330.8404, -56.7861, 3.64, 6.89, K_ORANGE),
  star('tau-ceti', 'Tau Ceti', 26.0171, -15.9375, 3.65, 5.68, G_YELLOW_WHITE),
  star('kapteyns-star', "Kapteyn's Star", 77.9192, -45.0183, 3.93, 10.87, M_RED),
  star('altair', 'Altair', 297.6958, 8.8683, 5.13, 2.22, A_F_WHITE),
  star('vega', 'Vega', 279.2346, 38.7836, 7.68, 0.58, A_F_WHITE),
  star('fomalhaut', 'Fomalhaut', 344.4125, -29.6222, 7.7, 1.72, A_F_WHITE),
  star('pollux', 'Pollux', 116.3289, 28.0261, 10.34, 1.08, K_ORANGE),
];

/** Shared spec for the body row makers — the fields a seeded sphere needs
 *  beyond what `ORBITAL_ELEMENTS` already carries (its position derives from
 *  the elements). Named fields so the numeric columns can't be mis-ordered. */
type BodySpec = { id: string; label: string; radiusKm: number; albedo: Vec3 };

/**
 * Row maker for a HELIOCENTRIC planet: its focus is the render origin (the
 * Sun), so its world position is the render origin plus the element table's
 * `keplerianPositionMpc` offset — no hand-placed literals. The element table
 * already carries each orbit's real inclination, so each body sits exactly on
 * the ellipse its trail draws (both read the one table). Component-wise focus
 * addition lives here (there is no vec3-add helper), the same one-place idiom
 * `star()` uses. Moons are NOT built through this — they are geocentric
 * (`satelliteBody`).
 */
function heliocentricPlanet(spec: BodySpec): PlanetBody {
  const offset = keplerianPositionMpc(elementsById(spec.id));
  return {
    id: spec.id,
    label: spec.label,
    positionMpc: [
      RENDER_ORIGIN_MPC[0] + offset[0],
      RENDER_ORIGIN_MPC[1] + offset[1],
      RENDER_ORIGIN_MPC[2] + offset[2],
    ],
    radiusKm: spec.radiusKm,
    albedo: spec.albedo,
  };
}

/**
 * Row maker for a MOON: its focus is its parent PLANET's world position, so its
 * world position is the render origin plus the parent's heliocentric offset plus
 * the moon's own offset from the parent — both from `keplerianPositionMpc`, each
 * honouring its row's `plane` (a moon's is its parent's equatorial frame). Every
 * moon parent (Earth, Mars, Jupiter, Saturn) is itself heliocentric, so one
 * parent hop suffices; there is no moon-of-a-moon. This subsumes Earth's Moon
 * too — its parent 'earth' resolves to the same position `SCENE_EARTH` derives.
 */
function satelliteBody(spec: BodySpec): PlanetBody {
  const el = elementsById(spec.id);
  const parentOffset = keplerianPositionMpc(elementsById(el.parentId!));
  const moonOffset = keplerianPositionMpc(el);
  return {
    id: spec.id,
    label: spec.label,
    positionMpc: [
      RENDER_ORIGIN_MPC[0] + parentOffset[0] + moonOffset[0],
      RENDER_ORIGIN_MPC[1] + parentOffset[1] + moonOffset[1],
      RENDER_ORIGIN_MPC[2] + parentOffset[2] + moonOffset[2],
    ],
    radiusKm: spec.radiusKm,
    albedo: spec.albedo,
  };
}

/**
 * Planet + moon seeds at their real J2000 mean positions, DERIVED from
 * `ORBITAL_ELEMENTS` via `keplerianPositionMpc` — no hand-placed literals. The
 * seven non-Earth major planets are heliocentric (`heliocentricPlanet`); the
 * Moon and the planets' major moons are geocentric (`satelliteBody`), riding
 * their parent by construction (spec §5 Moon gotcha). Each body sits exactly on
 * the ellipse its trail draws, both reading the one element table. Albedos are
 * plausible flat linear-RGB colours (no textures yet).
 */
export const SCENE_PLANETS: readonly PlanetBody[] = [
  heliocentricPlanet({
    id: 'mercury',
    label: 'Mercury',
    radiusKm: 2440,
    albedo: [0.3, 0.29, 0.27],
  }),
  heliocentricPlanet({ id: 'venus', label: 'Venus', radiusKm: 6052, albedo: [0.85, 0.8, 0.6] }),
  heliocentricPlanet({ id: 'mars', label: 'Mars', radiusKm: 3390, albedo: [0.6, 0.32, 0.23] }),
  heliocentricPlanet({
    id: 'jupiter',
    label: 'Jupiter',
    radiusKm: 69911,
    albedo: [0.8, 0.65, 0.45],
  }),
  heliocentricPlanet({ id: 'saturn', label: 'Saturn', radiusKm: 58232, albedo: [0.8, 0.7, 0.5] }),
  heliocentricPlanet({ id: 'uranus', label: 'Uranus', radiusKm: 25362, albedo: [0.6, 0.8, 0.82] }),
  heliocentricPlanet({
    id: 'neptune',
    label: 'Neptune',
    radiusKm: 24622,
    albedo: [0.3, 0.42, 0.75],
  }),
  satelliteBody({ id: 'moon', label: 'Moon', radiusKm: 1737, albedo: [0.35, 0.34, 0.33] }),
  satelliteBody({ id: 'phobos', label: 'Phobos', radiusKm: 11, albedo: [0.3, 0.29, 0.28] }),
  satelliteBody({ id: 'deimos', label: 'Deimos', radiusKm: 6, albedo: [0.32, 0.3, 0.28] }),
  satelliteBody({ id: 'io', label: 'Io', radiusKm: 1822, albedo: [0.6, 0.55, 0.32] }),
  satelliteBody({ id: 'europa', label: 'Europa', radiusKm: 1561, albedo: [0.75, 0.75, 0.72] }),
  satelliteBody({ id: 'ganymede', label: 'Ganymede', radiusKm: 2634, albedo: [0.55, 0.52, 0.48] }),
  satelliteBody({ id: 'callisto', label: 'Callisto', radiusKm: 2410, albedo: [0.4, 0.38, 0.35] }),
  satelliteBody({ id: 'mimas', label: 'Mimas', radiusKm: 198, albedo: [0.72, 0.73, 0.73] }),
  satelliteBody({ id: 'enceladus', label: 'Enceladus', radiusKm: 252, albedo: [0.92, 0.92, 0.92] }),
  satelliteBody({ id: 'tethys', label: 'Tethys', radiusKm: 531, albedo: [0.76, 0.77, 0.77] }),
  satelliteBody({ id: 'dione', label: 'Dione', radiusKm: 561, albedo: [0.72, 0.72, 0.72] }),
  satelliteBody({ id: 'rhea', label: 'Rhea', radiusKm: 764, albedo: [0.7, 0.71, 0.71] }),
  satelliteBody({ id: 'titan', label: 'Titan', radiusKm: 2575, albedo: [0.8, 0.6, 0.35] }),
  satelliteBody({ id: 'iapetus', label: 'Iapetus', radiusKm: 735, albedo: [0.4, 0.37, 0.32] }),
];

/**
 * SCENE_BODIES — the flat registry every body-aware consumer reads from: the
 * command-palette search rows, the `body-<id>` focus-id resolver, and the
 * selection-row extractor all iterate / look up this one list. Seeding a new
 * body is a one-line push into its seed table above — no parallel list to
 * keep in sync. Consumers only touch the fields the `SceneBody` union shares
 * (`id`, `label`, `positionMpc`, `radiusKm`).
 */
export const SCENE_BODIES: readonly SceneBody[] = [SCENE_EARTH, ...SCENE_STARS, ...SCENE_PLANETS];
