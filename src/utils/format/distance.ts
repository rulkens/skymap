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
 *
 * Every formatter pairs the parsec value with its matching light-year
 * equivalent (kpc↔kly, Mpc↔Mly, Gpc↔Gly).  Parsecs are the working unit
 * of cosmology but not of casual readers; the dual format ("100 Mpc /
 * 326 Mly") gives a parsec-fluent astronomer the precise number while
 * letting a layperson anchor it against the more familiar light-year.
 * The slash separator is intentional: " · " is already used between
 * different facts (distance · velocity), so reusing it would conflate
 * "alternate unit for the same distance" with "another fact".
 */

import { PC_TO_LY } from '../math/constants';

/**
 * Format a number with adaptive precision: an integer below 100, one
 * decimal between 10 and 100, and `toLocaleString`'s default for very
 * small or very large.  Keeps the dual-unit string compact ("326 Mly"
 * not "326.156 Mly") without burying meaningful digits at low values.
 */
function formatScalar(n: number): string {
  if (n === 0) return '0';
  const abs = Math.abs(n);
  if (abs >= 100) return Math.round(n).toLocaleString();
  if (abs >= 10) return n.toFixed(1);
  if (abs >= 1) return n.toFixed(2);
  return n.toLocaleString();
}

/**
 * Format a distance in megaparsecs (Mpc) with adaptive units, paired
 * with a matching light-year value.
 *
 * Switches to kpc below 1 Mpc and Gpc above 1000 Mpc so the displayed
 * value is always between 1 and 1000 (with adaptive units), making the
 * scale bar and info-card distance fields easy to read at any zoom
 * level.  The light-year conversion uses the same decade so the two
 * sides of the slash agree — kpc↔kly, Mpc↔Mly, Gpc↔Gly — rather than
 * forcing readers to mentally re-scale across different unit decades.
 *
 * @param mpc  Distance in megaparsecs. Must be non-negative.
 */
export function formatDistance(mpc: number): string {
  if (mpc < 1) {
    const kpc = mpc * 1000;
    const kly = kpc * PC_TO_LY;
    return `${formatScalar(kpc)} kpc / ${formatScalar(kly)} kly`;
  }
  if (mpc >= 1000) {
    const gpc = mpc / 1000;
    const gly = gpc * PC_TO_LY;
    return `${formatScalar(gpc)} Gpc / ${formatScalar(gly)} Gly`;
  }
  const mly = mpc * PC_TO_LY;
  return `${formatScalar(mpc)} Mpc / ${formatScalar(mly)} Mly`;
}

/**
 * Format a galaxy diameter in kiloparsecs alongside its kilo-light-year
 * equivalent.  The InfoCard's diameter row is the canonical caller; we
 * pin to kpc rather than auto-switching to pc/Mpc because galaxy
 * diameters in this catalog never leave the kpc range (~0.5 kpc dwarfs
 * up to ~150 kpc giants).
 *
 * @param kpc  Diameter in kiloparsecs. Must be non-negative.
 */
export function formatDiameterKpc(kpc: number): string {
  const kly = kpc * PC_TO_LY;
  return `${formatScalar(kpc)} kpc / ${formatScalar(kly)} kly`;
}
