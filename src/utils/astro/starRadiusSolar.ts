/**
 * Radius in solar units from luminosity and effective temperature, via the
 * Stefan–Boltzmann law (L ∝ R²·T⁴) referenced to the Sun:
 *
 *   R/R☉ = √(L/L☉) · (T☉ / T_eff)²,   T☉ = 5772 K
 *
 * The (T☉/T)² factor is why a cool, luminous star comes out large: at fixed
 * luminosity a lower surface temperature must be paid for with more surface
 * area. An order-of-magnitude estimate — it inherits the no-extinction,
 * solar-metallicity caveats of the luminosity and temperature it composes.
 */
const T_SUN_K = 5772;

export function starRadiusSolar(luminositySolar: number, teffK: number): number {
  return Math.sqrt(luminositySolar) * (T_SUN_K / teffK) ** 2;
}
