/**
 * Distance formatting utility for the SDSS galaxy renderer.
 *
 * A single helper lives here rather than in physics.ts or engine.ts because
 * it is needed in two independent places — the engine's scale-bar computation
 * and the InfoCard's distance display — and duplicating it would risk the two
 * drifting apart.  Moving it here makes the deduplication explicit.
 *
 * The unit thresholds match SDSS's data range:
 *   - Most spectroscopic galaxies: 100 – 3000 Mpc → "Mpc" range.
 *   - Very nearby objects (z < 0.001): sub-Mpc → "kpc" range.
 *   - High-redshift quasars (z > 0.3): > 1000 Mpc → "Gpc" range.
 */

/**
 * Format a distance in megaparsecs (Mpc) with adaptive units.
 *
 * Switches to kpc below 1 Mpc and Gpc above 1000 Mpc so the displayed value
 * is always between 1 and 1000 (with adaptive units), making the scale bar
 * and info-card distance fields easy to read at any zoom level.
 *
 * @param mpc  Distance in megaparsecs. Must be non-negative.
 */
export function formatDistance(mpc: number): string {
  if (mpc < 1) return `${(mpc * 1000).toLocaleString()} kpc`;
  if (mpc >= 1000) return `${(mpc / 1000).toLocaleString()} Gpc`;
  return `${mpc.toLocaleString()} Mpc`;
}
