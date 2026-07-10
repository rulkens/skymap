/**
 * sceneOrbits — the debug orbit-ring table, DERIVED from the scene body seeds.
 *
 * Three guidance rings ship: Earth around the Sun, Jupiter around the Sun, and
 * the Moon around Earth. Each is an analytic circle in an orbital plane, drawn
 * as a scale-independent SDF annulus with a brightness lobe at the body's
 * current position (see `orbitRing/*.wesl` + `orbitRingRenderer.ts`).
 *
 * ### Why derive, never hand-author
 *
 * A ring's radius and centre are exactly `|body − parent|` and the parent's
 * position — the same numbers the body seeds already carry. Deriving the table
 * from `SCENE_EARTH` / `SCENE_PLANETS` (rather than re-typing radii as decimals)
 * makes drift structurally impossible: move a body seed and its ring follows.
 * This is the single-source-of-truth rule the whole `bodies/` folder observes.
 *
 * ### The orbital-plane basis
 *
 * Every solar-system body orbits near the ecliptic, NOT the equatorial plane the
 * scene frame is built on (`raDecDistToCartesian` → equatorial J2000; +z is
 * Earth's spin axis). So each ring's plane normal is `ECLIPTIC_BASIS.normal`,
 * the ecliptic normal expressed in equatorial-frame components.
 *
 * For each orbit we build an orthonormal in-plane basis `(uAxis, vAxis)`:
 *
 *   1. `uAxis` starts as `normalize(body − parent)` — pointed AT the body. We
 *      then project out any component along the plane normal and renormalise,
 *      so `uAxis` is guaranteed in-plane even when the body sits slightly off
 *      the ecliptic (the Moon's authored offset stays in-plane today, but the
 *      projection keeps the basis orthonormal regardless of a future off-plane
 *      seed). Aiming `uAxis` at the body is what lands the shader's fixed
 *      angle-0 brightness lobe on the body with zero per-instance angle plumbing.
 *   2. `vAxis = normalize(normal × uAxis)` completes a right-handed in-plane
 *      basis; `uAxis × vAxis` reproduces the normal.
 *
 * ### Colours
 *
 * Dim, distinct linear-RGB tints — soft blue (Earth), warm tan (Jupiter),
 * neutral grey (Moon). These draw ADDITIVELY into the HDR target, so the max
 * channel is kept well under 1 to guide the eye without blowing out.
 */

import { SCENE_EARTH, SCENE_PLANETS } from './sceneBodies';
import { ECLIPTIC_BASIS } from './eclipticBasis';
import { RENDER_ORIGIN_MPC } from '../renderOrigin';
import type { SceneOrbit } from '../../@types/scene/SceneOrbit';
import type { Vec3 } from '../../@types/math/Vec3';

// ── Module-local f64 vector helpers ──────────────────────────────────────────
//
// Plain-number (f64) arithmetic on Vec3 tuples. The orbit radii live at AU-to-
// lunar scale in Mpc (~5e-12 down to ~1e-14); narrowing to f32 mid-derivation
// would risk losing the small `body − parent` difference, so the table is built
// entirely in double precision and only the GPU-upload path (composeOrbitMvp)
// narrows. These are authored-table helpers, not a `src/utils/` export — same
// module-local status as `sceneBodies.ts`'s `star()` maker.

function sub(a: Readonly<Vec3>, b: Readonly<Vec3>): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dot(a: Readonly<Vec3>, b: Readonly<Vec3>): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function length(a: Readonly<Vec3>): number {
  return Math.sqrt(dot(a, a));
}

function normalize(a: Readonly<Vec3>): Vec3 {
  const len = length(a);
  return [a[0] / len, a[1] / len, a[2] / len];
}

function cross(a: Readonly<Vec3>, b: Readonly<Vec3>): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function scale(a: Readonly<Vec3>, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

/**
 * Build one orbit ring from a parent position, a body position, and a tint.
 * `uAxis` is aimed at the body then orthogonalised against the ecliptic normal;
 * `vAxis` completes the in-plane basis. `radiusMpc` is the full `|body − parent|`
 * separation.
 */
function orbit(id: string, centerMpc: Vec3, bodyMpc: Readonly<Vec3>, color: Vec3): SceneOrbit {
  const normal = ECLIPTIC_BASIS.normal;
  const radial = sub(bodyMpc, centerMpc);
  const radiusMpc = length(radial);

  // uAxis: pointed at the body, then projected onto the orbital plane so the
  // basis stays orthonormal even if the body drifts off the ecliptic.
  const aimed = normalize(radial);
  const uAxis = normalize(sub(aimed, scale(normal, dot(aimed, normal))));
  // vAxis completes a right-handed in-plane basis; uAxis × vAxis == normal.
  const vAxis = normalize(cross(normal, uAxis));

  return { id, centerMpc, uAxis, vAxis, radiusMpc, color };
}

// Locate the seeded planets the rings reference by id — the seeds are the
// single source of truth, so the ring table never re-types their positions.
const MOON = SCENE_PLANETS.find((planet) => planet.id === 'moon')!;
const JUPITER = SCENE_PLANETS.find((planet) => planet.id === 'jupiter')!;

// Dim linear-RGB tints (max channel ≲ 0.5 for the additive HDR draw).
const EARTH_BLUE: Vec3 = [0.15, 0.25, 0.5];
const JUPITER_TAN: Vec3 = [0.5, 0.38, 0.2];
const MOON_GREY: Vec3 = [0.35, 0.35, 0.4];

// The Sun sits at the render origin, so the heliocentric orbits centre there.
const SUN_MPC: Vec3 = [RENDER_ORIGIN_MPC[0], RENDER_ORIGIN_MPC[1], RENDER_ORIGIN_MPC[2]];

/**
 * The debug orbit rings, derived from the body seeds. Earth and Jupiter orbit
 * the Sun (the origin); the Moon orbits Earth's seeded position.
 */
export const SCENE_ORBITS: readonly SceneOrbit[] = [
  orbit('earth', [...SUN_MPC], SCENE_EARTH.positionMpc, EARTH_BLUE),
  orbit('jupiter', [...SUN_MPC], JUPITER.positionMpc, JUPITER_TAN),
  orbit('moon', [...SCENE_EARTH.positionMpc], MOON.positionMpc, MOON_GREY),
];
