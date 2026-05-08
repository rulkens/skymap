/**
 * namedGalaxies — registry of individual galaxies that the engine
 * renders or labels by name, with their canonical sky coordinates and
 * distance to the observer.
 *
 * ## Why a dedicated type + module
 *
 * The catalog data files (`sdss.bin`, `2mrs.bin`, `glade.bin`) hold
 * millions of galaxies as raw point clouds: each gets a position
 * computed from `(ra, dec, redshift)` at parse time, no name carried.
 * That works for the sea of background galaxies but doesn't compose
 * with the small number of galaxies the engine treats specially:
 *
 *   - The Milky Way: rendered as a procedural impostor centered on
 *     its own galactic center (Sgr A\*), not at the catalog origin.
 *   - Future per-galaxy hero renderers (e.g. an Andromeda M31 spiral
 *     impostor) would each need a known world-space anchor point.
 *
 * `NamedGalaxy` lets each of these live alongside the canonical RA /
 * Dec / distance values they were measured at, with a precomputed
 * Cartesian world position so consumers don't have to repeat the
 * conversion.  Callers that just need the world position read
 * `MILKY_WAY.worldPos`; callers that want to display sky-coord
 * metadata read `raDeg` / `decDeg` directly.
 *
 * ## Coordinate convention
 *
 * `worldPos` is in the same right-handed equatorial frame the catalog
 * builders use (`tools/buildFamous.ts`, `utils/math/raDecZToCartesian.ts`):
 *
 *   +x → (RA = 0°,  Dec = 0°)
 *   +y → (RA = 90°, Dec = 0°)
 *   +z →  Dec = +90°  (celestial north pole)
 *
 * Origin = the observer (Earth/Sun).  All catalog distances are zeroed
 * here, which is why the Milky Way's own center is NOT at (0, 0, 0)
 * — Earth sits ~8 kpc from Sgr A\*, in the disk.
 */

import { raDecDistToCartesian } from '../utils/math/raDecDistToCartesian';

export type NamedGalaxy = {
  /** Display name (used in UI labels, debug output). */
  readonly name: string;
  /** Right ascension in degrees (J2000), [0, 360). */
  readonly raDeg: number;
  /** Declination in degrees (J2000), [-90, +90]. */
  readonly decDeg: number;
  /**
   * Distance from the observer (Earth/Sun) in Mpc.  For Local-Group
   * members this is a direct measurement; for more distant galaxies
   * it would typically come from a redshift-independent indicator
   * (Cepheid, TRGB, surface-brightness fluctuation) rather than the
   * catalog's redshift-Hubble assumption.
   */
  readonly distanceMpc: number;
  /**
   * Cartesian world position derived from (raDeg, decDeg, distanceMpc).
   * Computed at module load via `raDecDistToCartesian` so consumers
   * never have to repeat the spherical→Cartesian math.  Frozen tuple
   * to match the readonly contract of `Label.worldPos` etc.
   */
  readonly worldPos: readonly [number, number, number];
};

/**
 * Construct a `NamedGalaxy` entry, computing `worldPos` from the sky
 * coordinates so the table below stays declarative.
 */
function defineNamedGalaxy(
  name: string,
  raDeg: number,
  decDeg: number,
  distanceMpc: number,
): NamedGalaxy {
  return {
    name,
    raDeg,
    decDeg,
    distanceMpc,
    worldPos: raDecDistToCartesian(raDeg, decDeg, distanceMpc),
  };
}

/**
 * The Milky Way.
 *
 * Center coordinates are taken at Sagittarius A\*, the supermassive
 * black hole at the dynamical center of the Galaxy.  Distance from
 * the Sun ≈ 8.0 kpc (= 0.008 Mpc) per the GRAVITY collaboration's
 * 2019 measurement; the canonical short-form figure used widely in
 * the literature.  RA/Dec are the standard J2000 values for Sgr A\*
 * (17h 45m 40.04s, −29° 00′ 28.1″ → 266.4168°, −29.0078°).
 *
 * Note: the catalog data origin sits at the OBSERVER (Earth), not
 * here.  The Milky Way impostor renderer uses `MILKY_WAY.worldPos` as
 * its billboard center so the galaxy's center renders ~8 kpc away
 * from the user's "you are here" anchor at the world origin — which
 * is the astronomically correct relationship.
 */
export const MILKY_WAY: NamedGalaxy = defineNamedGalaxy(
  'Milky Way',
  266.4168,
  -29.0078,
  0.008,
);
