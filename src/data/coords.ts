/**
 * Sky-coordinate ↔ 3D Cartesian conversion (both directions).
 *
 * SDSS gives us each object's position on the sky as (RA, Dec) — two angles —
 * plus a redshift `z` that tells us how far away it is. To render in 3D we
 * need (x, y, z) in some Cartesian frame. This module provides both the
 * forward conversion (raDecZToCartesian) and its inverse (cartesianToRaDecZ).
 *
 * The inverse is useful for:
 *   - Displaying sky coordinates on hover for synthetic data (which only stores
 *     xyz positions in the GPU buffer).
 *   - Sanity-checking the forward conversion via round-trip tests.
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

/**
 * Convert Cartesian (x, y, z) in Mpc → (RA in degrees, Dec in degrees, redshift).
 *
 * This is the exact inverse of `raDecZToCartesian`, using the same equatorial
 * right-handed convention:
 *   - +x → (RA = 0°,  Dec = 0°)
 *   - +y → (RA = 90°, Dec = 0°)
 *   - +z → Dec = +90° (north pole)
 *
 * Inversion steps:
 *   1. d = √(x² + y² + z²)                — recover the distance in Mpc
 *   2. z_redshift = d / (c/H₀)            — invert Hubble's law
 *   3. dec = asin(z_cart / d)              — recover declination, range [-90, +90]
 *   4. ra  = atan2(y, x)                   — recover right ascension, then wrap to [0, 360)
 *
 * Why `atan2` rather than `atan(y/x)`?
 *   `atan` only returns values in (-90°, +90°) and loses sign information when
 *   both y and x change sign together. `atan2(y, x)` uses both arguments to
 *   return the full [-180°, +180°] range and handles x = 0 without a
 *   divide-by-zero.
 *
 * Edge case — origin (d = 0):
 *   z = 0 means the observer's own position. There is no meaningful RA or Dec
 *   for the origin itself (every direction is equally valid), so we return the
 *   sentinel [0, 0, 0] rather than propagating NaN through asin/atan2.
 *
 * @param x  Cartesian x in Mpc (equatorial, right-handed).
 * @param y  Cartesian y in Mpc.
 * @param z  Cartesian z in Mpc (note: this is the *spatial* z, not redshift).
 * @returns  [raDeg, decDeg, zRedshift] — RA in [0, 360), Dec in [-90, +90], z ≥ 0.
 */
export function cartesianToRaDecZ(
  x: number,
  y: number,
  z: number,
): [number, number, number] {
  const d = Math.sqrt(x * x + y * y + z * z);

  // Guard against the degenerate origin — asin(0/0) and atan2(0,0) are both
  // well-defined in JS (returning 0 and 0 respectively), but dividing by d=0
  // would give NaN for the redshift. Return the agreed sentinel instead.
  if (d === 0) return [0, 0, 0];

  // Hubble's law inverted: d = c·z/H₀  →  z = d·H₀/c = d / (c/H₀)
  const zRedshift = d / HUBBLE_DISTANCE_MPC;

  // Recover Dec: z_cart = d · sin(dec)  →  dec = asin(z_cart / d)
  // We clamp z/d to [-1, +1] before passing to asin because floating-point
  // arithmetic can produce values like 1.0000000000000002 when d is computed
  // from a point that was originally at Dec = ±90°, causing asin to return NaN.
  const decRad = Math.asin(Math.max(-1, Math.min(1, z / d)));

  // Recover RA: x = d·cos(dec)·cos(ra), y = d·cos(dec)·sin(ra)
  // → ra = atan2(y, x)  (the cos(dec) factor cancels in both numerator and
  //   denominator, so we don't need to divide it out explicitly).
  // atan2 returns values in (-π, +π]; we want [0, 2π) to match the [0°, 360°)
  // convention used by astronomical catalogs, so we add 2π when negative.
  let raRad = Math.atan2(y, x);
  if (raRad < 0) raRad += 2 * Math.PI;

  const TO_DEG = 180 / Math.PI;
  return [raRad * TO_DEG, decRad * TO_DEG, zRedshift];
}
