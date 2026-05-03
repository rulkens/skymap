/**
 * Sky-coordinate → 3D Cartesian conversion.
 *
 * SDSS gives us each object's position on the sky as (RA, Dec) — two angles —
 * plus a redshift `z` that tells us how far away it is. To render in 3D we
 * need (x, y, z) in some Cartesian frame. This module does that conversion.
 *
 * Two simplifications worth knowing:
 *
 *   1. We use HUBBLE'S LAW (d = cz/H₀) for distance. This is only accurate at
 *      low redshift (z ≪ 1). For SDSS galaxies (most z < 0.2) it's fine to
 *      a few percent. A proper treatment would integrate the ΛCDM cosmology
 *      to get *comoving distance*; deferred until we need it.
 *
 *   2. Our axes are equatorial-aligned (x toward RA=0/Dec=0, z toward the
 *      celestial north pole), not galactic. Switching is a single rotation
 *      matrix — also deferred.
 */

/** Speed of light in km/s (exact by definition since 1983). */
const C_KM_S = 299792.458;

/**
 * Hubble constant H₀ in km/s/Mpc.
 *
 * 70 is a round, commonly-used value; the actual measured value is somewhere
 * around 67–73 depending on the method (the "Hubble tension"). Since we're
 * using the linear approximation anyway, the exact value doesn't matter much
 * for visualization.
 */
const H0_KM_S_MPC = 70;

/**
 * The Hubble distance c/H₀ ≈ 4282.75 Mpc.
 *
 * Precomputing means `redshiftToDistanceMpc` is a single multiplication
 * inside the hot loop that converts millions of catalog rows to xyz.
 */
const HUBBLE_DISTANCE_MPC = C_KM_S / H0_KM_S_MPC;

/**
 * Convert a redshift z to a comoving distance in Mpc using Hubble's law:
 *
 *     d = c · z / H₀
 *
 * Returns 0 at z = 0 (the observer). Linear in z — diverges from the true
 * cosmological distance once z ≳ 0.3 or so.
 */
export function redshiftToDistanceMpc(z: number): number {
  return HUBBLE_DISTANCE_MPC * z;
}

/**
 * Convert (RA, Dec, z) → Cartesian (x, y, z) in Mpc.
 *
 * Convention (right-handed, equatorial):
 *   - +x points to (RA = 0°,   Dec = 0°)   — vernal equinox direction
 *   - +y points to (RA = 90°,  Dec = 0°)
 *   - +z points to  Dec = +90°            — celestial north pole
 *
 * The math is just spherical → Cartesian with the radius set to the
 * Hubble distance for redshift z:
 *
 *     x = d · cos(dec) · cos(ra)
 *     y = d · cos(dec) · sin(ra)
 *     z = d · sin(dec)
 *
 * @param raDeg  Right Ascension in *degrees* (SDSS catalogs use degrees, not hours).
 * @param decDeg Declination in degrees, [-90, +90].
 * @param z      Redshift (dimensionless). z = 0 returns the origin.
 */
export function raDecZToCartesian(
  raDeg: number,
  decDeg: number,
  z: number,
): [number, number, number] {
  const d = redshiftToDistanceMpc(z);
  // Math.cos / Math.sin take radians; SDSS gives us degrees.
  const ra = (raDeg * Math.PI) / 180;
  const dec = (decDeg * Math.PI) / 180;
  const cosDec = Math.cos(dec);
  return [
    d * cosDec * Math.cos(ra),
    d * cosDec * Math.sin(ra),
    d * Math.sin(dec),
  ];
}
