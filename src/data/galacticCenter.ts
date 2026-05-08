/**
 * galacticCenter — coordinates of the Milky Way's dynamical center.
 *
 * The catalog data origin sits at the OBSERVER (Earth/Sun), so the
 * Milky Way's center is NOT at world (0, 0, 0).  It's offset by
 * ~8 kpc in the direction of Sagittarius A\*, the supermassive black
 * hole at the galactic center.  The Milky Way impostor renderer uses
 * `MILKY_WAY_CENTER_WORLD` as its `centerWorld` parameter so the
 * billboard renders where the galaxy actually is in space.
 *
 * ## Why a separate file (not in `namedGalaxies` or `famous_galaxies.seed.json`)
 *
 * The famous-galaxies pipeline (`tools/buildFamous.ts`,
 * `famous_galaxies.seed.json`) is for extragalactic objects with a
 * meaningful "distance from us".  The Milky Way's own center is a
 * different kind of thing: we're INSIDE the galaxy, the conventional
 * catalog distance to it is undefined (we'd need to pick a reference
 * point — bulge, Sgr A\*, mean stellar position).  Adding it to the
 * famous seed would also enroll it as a regular point in `famous.bin`
 * and double-render it next to the impostor.
 *
 * Single-purpose file → single source of truth for the constant, no
 * type machinery needed.  Future per-galaxy impostors (e.g. M31)
 * read THEIR center from the famous bin's positions array via the
 * existing meta lookup; only the Milky Way needs this special case.
 */

import { raDecDistToCartesian } from '../utils/math/raDecDistToCartesian';

/** Sagittarius A\* RA (J2000) in degrees: 17h 45m 40.04s. */
const SGR_A_RA_DEG = 266.4168;

/** Sagittarius A\* Dec (J2000) in degrees: −29° 00′ 28.1″. */
const SGR_A_DEC_DEG = -29.0078;

/**
 * Distance from the Sun to Sagittarius A\* in megaparsecs (~8.0 kpc).
 *
 * This is the canonical short-form figure used widely in the
 * literature; the GRAVITY collaboration's 2019 trigonometric-orbit
 * measurement gives R₀ = 8.178 ± 0.013 (stat) ± 0.022 (sys) kpc,
 * which we round to 8.0 kpc here for simplicity.  The 2% precision
 * gap is invisible at any zoom that shows the impostor.
 */
const SGR_A_DIST_MPC = 0.008;

/**
 * World-space position of the Milky Way's center, derived from
 * Sgr A\*'s sky coordinates and distance.  Same right-handed
 * equatorial frame as everything else in the engine
 * (`raDecDistToCartesian` documents the convention).
 *
 * Approximate value: (-0.000476, -0.006982, -0.003879) Mpc.
 */
export const MILKY_WAY_CENTER_WORLD: readonly [number, number, number] =
  raDecDistToCartesian(SGR_A_RA_DEG, SGR_A_DEC_DEG, SGR_A_DIST_MPC);
